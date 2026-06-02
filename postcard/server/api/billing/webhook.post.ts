/**
 * Stripe webhook — the source of truth for entitlement changes. Verifies the
 * signature against the raw body, then reconciles the user's `plan`/`planStatus`
 * from the subscription. Configure the endpoint URL in Stripe as
 * `<app>/api/billing/webhook` and set NUXT_STRIPE_WEBHOOK_SECRET.
 */
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import { planForPriceId } from '../../utils/plans'
import { getStripe } from '../../utils/stripe'

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const db = getDb()
  const priceId = sub.items.data[0]?.price?.id
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const active = sub.status === 'active' || sub.status === 'trialing'
  const plan = active ? (planForPriceId(priceId) ?? 'free') : 'free'

  await db.update(users)
    .set({
      plan,
      planStatus: sub.status,
      stripeSubscriptionId: sub.id,
      updatedAt: Date.now()
    })
    .where(eq(users.stripeCustomerId, customerId))
}

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig().stripe
  const sig = getRequestHeader(event, 'stripe-signature')
  const raw = await readRawBody(event)
  if (!sig || !raw || !cfg.webhookSecret) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid webhook request' })
  }

  let evt: Stripe.Event
  try {
    evt = await getStripe().webhooks.constructEventAsync(raw, sig, cfg.webhookSecret)
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: `Webhook signature failed: ${e instanceof Error ? e.message : 'error'}` })
  }

  switch (evt.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applySubscription(evt.data.object as Stripe.Subscription)
      break
    case 'checkout.session.completed': {
      const session = evt.data.object as Stripe.Checkout.Session
      if (session.subscription) {
        const sub = await getStripe().subscriptions.retrieve(
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        )
        await applySubscription(sub)
      }
      break
    }
  }

  return { received: true }
})
