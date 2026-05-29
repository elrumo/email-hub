import { assertSafeUrl } from '../../connectors/ssrf'
import { convertOpenApi } from '../../connectors/openapi'
import { validateConnectorDef } from '../../connectors/validate'

/**
 * Generate a connector from an OpenAPI/Swagger spec — supplied either inline
 * (`spec`: the JSON/YAML text) or by `url` (fetched here, SSRF-guarded). The
 * spec is converted to a `ConnectorDef`, validated, and RETURNED for review;
 * it is NOT installed. The review UI then POSTs the returned `def` to
 * `/api/connectors` to install it (reusing the normal validate→register path).
 *
 * Body:
 *   { url?: string, spec?: string,
 *     id?: string, name?: string, include?: string[], baseUrl?: string }
 *
 * Response: { ok, def?, warnings?, summary?, error? } where summary mirrors the
 * /validate endpoint's shape so the UI can show actions/connection fields.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  let specText = typeof body?.spec === 'string' ? body.spec : ''

  if (!url && !specText) {
    throw createError({ statusCode: 400, statusMessage: 'provide either a spec (file contents) or a url' })
  }

  // Fetch the spec from a URL — same SSRF guard as a connector request, so the
  // import path can't be used to probe the internal network.
  if (url && !specText) {
    const safe = await assertSafeUrl(url)
    if (!safe.ok) {
      throw createError({ statusCode: 400, statusMessage: `spec url blocked: ${safe.reason}` })
    }
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json, application/yaml, text/yaml, text/plain, */*' },
        signal: AbortSignal.timeout(15_000)
      })
    } catch (e) {
      throw createError({ statusCode: 502, statusMessage: `could not fetch spec: ${e instanceof Error ? e.message : 'request failed'}` })
    }
    if (!res.ok) {
      throw createError({ statusCode: 502, statusMessage: `spec url returned ${res.status}` })
    }
    specText = await res.text()
  }

  const include = Array.isArray(body?.include)
    ? body.include.filter((t: unknown): t is string => typeof t === 'string' && !!t)
    : undefined

  const result = convertOpenApi(specText, {
    id: typeof body?.id === 'string' ? body.id : undefined,
    name: typeof body?.name === 'string' ? body.name : undefined,
    include,
    baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : undefined
  })

  if (!result.ok || !result.def) {
    return { ok: false, error: result.error, warnings: result.warnings }
  }

  // Run the same structural validation the install endpoint applies, so we
  // never hand back a def that would be rejected at install time. validate also
  // normalises the def (drops unknown fields, fills needsConnection defaults).
  const validation = validateConnectorDef(result.def)
  if (!validation.ok || !validation.value) {
    return {
      ok: false,
      error: `generated connector failed validation: ${validation.error}`,
      warnings: result.warnings
    }
  }
  const def = validation.value

  return {
    ok: true,
    def,
    warnings: result.warnings,
    summary: {
      id: def.id,
      name: def.name,
      version: def.meta?.version,
      connectionFields: def.connectionSchema.length,
      actions: def.actions.map(a => ({ id: a.id, name: a.name, method: a.request.method }))
    }
  }
})
