import { lookup } from 'node:dns/promises'
import net from 'node:net'

/**
 * SSRF guard for user-supplied connector requests.
 *
 * Built-in integrations are trusted code, so they bypass this. A community
 * connector, however, is untrusted data whose only capability is "make an
 * outbound HTTP request" — which, unguarded, lets a malicious recipe hit the
 * cloud metadata endpoint (169.254.169.254), localhost admin ports, or other
 * services on the private network, and exfiltrate the connection's secrets to
 * an attacker URL.
 *
 * We require https (or http only when explicitly allowed), reject non-public
 * destination IPs, and resolve the hostname up-front so a public name can't
 * point at a private A record. `NUXT_CONNECTOR_ALLOW_PRIVATE=1` disables the
 * check for trusted homelab setups where connectors legitimately call LAN IPs.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal'
])

export interface UrlCheckResult {
  ok: boolean
  reason?: string
}

function allowPrivate(): boolean {
  return process.env.NUXT_CONNECTOR_ALLOW_PRIVATE === '1'
}

/** Is an IP address in a private / loopback / link-local / reserved range? */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number, ...number[]]
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // loopback
    if (a === 0) return true // 0.0.0.0/8
    if (a === 169 && b === 254) return true // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a >= 224) return true // multicast / reserved
    return false
  }
  if (v === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true // loopback / unspecified
    if (lower.startsWith('fe80')) return true // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local
    // IPv4-mapped (::ffff:a.b.c.d) → check the embedded v4
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped?.[1]) return isPrivateIp(mapped[1])
    return false
  }
  return false // not an IP literal — caller resolves the hostname separately
}

/**
 * Validate a (templated, already-resolved) URL before fetching it. Resolves the
 * hostname and rejects private destinations unless explicitly allowed.
 */
export async function assertSafeUrl(rawUrl: string): Promise<UrlCheckResult> {
  if (allowPrivate()) return { ok: true }

  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return { ok: false, reason: `invalid URL: ${rawUrl}` }
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: `blocked protocol: ${u.protocol}` }
  }

  const host = u.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `blocked host: ${host}` }
  }

  // literal IP in the URL — check directly
  if (net.isIP(host)) {
    return isPrivateIp(host)
      ? { ok: false, reason: `blocked private address: ${host}` }
      : { ok: true }
  }

  // hostname — resolve every record and reject if ANY is private (defends
  // against a public name with a private A record / DNS rebinding).
  try {
    const addrs = await lookup(host, { all: true })
    if (!addrs.length) return { ok: false, reason: `could not resolve ${host}` }
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        return { ok: false, reason: `${host} resolves to a private address (${a.address})` }
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: `DNS lookup failed for ${host}: ${e instanceof Error ? e.message : e}` }
  }
}
