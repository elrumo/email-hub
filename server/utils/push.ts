import { eq, inArray } from 'drizzle-orm'
import webpush, { type PushSubscription } from 'web-push'
import { getDb } from '../db'
import { appKeys, pushSubscriptions } from '../db/schema'

/**
 * Web Push plumbing. One place that knows about VAPID keys and the push
 * service, so both the `browser` integration action and the "notify on run"
 * flow setting just call `sendPush(payload)`.
 *
 * VAPID keys are auto-generated on first use and persisted in the `app_keys`
 * table (so push works with zero config), unless NUXT_VAPID_PUBLIC_KEY /
 * NUXT_VAPID_PRIVATE_KEY are set — those win. The contact `mailto:` can be set
 * via NUXT_VAPID_SUBJECT; it's only used by some push services for abuse
 * contact and never shown to users.
 */

export interface PushPayload {
  title: string
  body: string
  /** click-through URL opened when the user taps the notification */
  url?: string
  /** groups notifications so a newer one replaces an older one of the same tag */
  tag?: string
}

// Index signature so it satisfies the app_keys.value column type
// (Record<string, unknown>) without a cast at every insert.
interface VapidKeys { publicKey: string, privateKey: string, [k: string]: unknown }

let cached: VapidKeys | null = null
let configured = false

/**
 * Resolve the VAPID keypair: env override → persisted DB row → freshly
 * generated + persisted. Idempotent and cached for the process lifetime.
 */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cached) return cached

  const cfg = useRuntimeConfig()
  const envPub = String(cfg.vapidPublicKey || '')
  const envPriv = String(cfg.vapidPrivateKey || '')
  if (envPub && envPriv) {
    cached = { publicKey: envPub, privateKey: envPriv }
    return cached
  }

  const db = getDb()
  const rows = await db.select().from(appKeys).where(eq(appKeys.key, 'vapid'))
  const stored = rows[0]?.value as VapidKeys | undefined
  if (stored?.publicKey && stored?.privateKey) {
    cached = stored
    return cached
  }

  const generated = webpush.generateVAPIDKeys()
  const keys: VapidKeys = { publicKey: generated.publicKey, privateKey: generated.privateKey }
  await db
    .insert(appKeys)
    .values({ key: 'vapid', value: keys, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: appKeys.key, set: { value: keys, updatedAt: Date.now() } })
  cached = keys
  return cached
}

/** The browser needs the public key to subscribe. */
export async function getVapidPublicKey(): Promise<string> {
  return (await getVapidKeys()).publicKey
}

async function ensureConfigured(): Promise<void> {
  const keys = await getVapidKeys()
  if (configured) return
  const subject = String(useRuntimeConfig().vapidSubject || '') || 'mailto:admin@example.com'
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey)
  configured = true
}

export interface SendResult {
  /** subscriptions that accepted the push */
  sent: number
  /** subscriptions that were gone (404/410) and have been pruned */
  pruned: number
  /** subscriptions that failed for another reason (still kept) */
  failed: number
}

/**
 * Fan a notification out to every subscribed device. Dead subscriptions
 * (404/410 from the push service) are deleted so the table self-heals. Never
 * throws on per-subscription failure — returns counts so callers can log.
 */
export async function sendPush(payload: PushPayload): Promise<SendResult> {
  await ensureConfigured()
  const db = getDb()
  const subs = await db.select().from(pushSubscriptions)
  if (subs.length === 0) return { sent: 0, pruned: 0, failed: 0 }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    tag: payload.tag
  })

  const deadIds: string[] = []
  let sent = 0
  let failed = 0

  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription as unknown as PushSubscription, body)
        sent += 1
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) deadIds.push(row.id)
        else failed += 1
      }
    })
  )

  if (deadIds.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, deadIds))
  }

  return { sent, pruned: deadIds.length, failed }
}
