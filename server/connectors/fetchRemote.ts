import { assertSafeUrl } from './ssrf'

/**
 * Fetch a remote JSON document (a ConnectorDef, a FlowBundle, or a marketplace
 * registry) over the SAME SSRF guard used for connector requests, so the
 * "install from URL" feature can't be turned into an internal-network probe.
 * Returns the parsed JSON or throws an H3 error.
 */
export async function fetchRemoteJson(rawUrl: string): Promise<unknown> {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!url) throw createError({ statusCode: 400, statusMessage: 'a url is required' })

  const safe = await assertSafeUrl(url)
  if (!safe.ok) throw createError({ statusCode: 400, statusMessage: `url blocked: ${safe.reason}` })

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(15_000)
    })
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: `could not fetch: ${e instanceof Error ? e.message : 'request failed'}` })
  }
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `url returned ${res.status}` })

  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'the url did not return valid JSON' })
  }
}
