/**
 * Resolve a best-guess favicon URL for a site, proxied through the server so it
 * works regardless of CORS and can read the page's <link rel="icon"> tags.
 *
 * Given { url }, fetch the page HTML, pull the highest-quality icon <link>, and
 * resolve it against the page URL. Falls back to /favicon.ico, then to Google's
 * public favicon service. Returns { icon } — an absolute http(s) URL, or null
 * if nothing usable was found.
 *
 * NOTE: like the ping proxy, this is a deliberate auth-gated fetch of a
 * user-entered URL on a single-user self-hosted tool; the SSRF surface is
 * accepted by design (see server/api/shortcuts/[id]/ping.get.ts).
 */
function assertHttpUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'url must be a valid URL' })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'url must be http or https' })
  }
  return parsed
}

/** Rank icon rel values so we prefer the crispest declared icon. */
function relScore(rel: string): number {
  const r = rel.toLowerCase()
  if (r.includes('apple-touch-icon')) return 3
  if (r.includes('mask-icon')) return 1
  if (r.includes('shortcut icon')) return 2
  if (r.includes('icon')) return 2
  return 0
}

/** Pull the largest dimension out of a sizes="32x32 16x16" attribute, if any. */
function sizeScore(sizes: string | undefined): number {
  if (!sizes) return 0
  if (sizes.toLowerCase() === 'any') return 1000
  let max = 0
  for (const m of sizes.matchAll(/(\d+)\s*x\s*\d+/gi)) {
    max = Math.max(max, Number(m[1]))
  }
  return max
}

/** Extract candidate icon hrefs from page HTML, best first. */
function parseIconLinks(html: string): string[] {
  const candidates: { href: string, score: number }[] = []
  // match <link ...> tags that look like icons
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const t = tag[0]
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(t)?.[1]
    if (!rel || !/icon/i.test(rel)) continue
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(t)?.[1]
    if (!href) continue
    const sizes = /\bsizes\s*=\s*["']([^"']+)["']/i.exec(t)?.[1]
    candidates.push({ href, score: relScore(rel) * 10000 + sizeScore(sizes) })
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .map(c => c.href)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const pageUrl = assertHttpUrl(String(body?.url ?? '').trim())

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(pageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; flow-hub-favicon/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    })

    // resolve against the final URL after redirects
    const base = new URL(res.url || pageUrl.toString())

    if (res.ok) {
      const html = (await res.text()).slice(0, 500_000)
      for (const href of parseIconLinks(html)) {
        try {
          const abs = new URL(href, base)
          if (abs.protocol === 'http:' || abs.protocol === 'https:') {
            return { icon: abs.toString() }
          }
        } catch {
          // skip unparseable hrefs (e.g. data: handled below by being dropped)
        }
      }
    }

    // fall back to the conventional /favicon.ico at the site root
    return { icon: new URL('/favicon.ico', base).toString() }
  } catch {
    // network/timeout — fall back to Google's favicon service so the user still
    // gets something reasonable to choose from
    return {
      icon: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(pageUrl.hostname)}`
    }
  } finally {
    clearTimeout(timer)
  }
})
