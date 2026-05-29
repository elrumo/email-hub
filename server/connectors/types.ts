/**
 * Declarative (user-uploadable) connector format.
 *
 * A `ConnectorDef` is PURE JSON — no functions, no code. It describes the same
 * surface an `Integration` exposes (id, name, connectionSchema, actions), but
 * each action carries an HTTP *recipe* (`HttpRequestSpec` + output mapping)
 * instead of a `run` function. `server/connectors/compile.ts` turns a
 * `ConnectorDef` into a real `Integration` by synthesizing each `run` from a
 * generic interpreter (`server/connectors/http.ts`).
 *
 * This is a generalization of the Dokploy spec → action machinery in
 * `server/integrations/dokploy.ts` (`callProcedure`): there the URL/auth were
 * hard-coded and only the procedure/method/fields were data; here ALL of it is
 * data, so connectors can be authored, uploaded, and shared without a redeploy.
 *
 * Because the recipe is inert, the only thing a connector can do at run time is
 * make an outbound HTTP request — see `server/connectors/ssrf.ts` for the guard
 * that keeps that from reaching internal/link-local addresses.
 */

import type { FieldSchema } from '../engine/types'

/** Current schema version. Bumped if the recipe format changes incompatibly. */
export const CONNECTOR_SCHEMA_VERSION = 1

/** How the request body is encoded. */
export type BodyType = 'none' | 'json' | 'form' | 'text'

/**
 * A templated HTTP request. Every string field may contain `{{ ... }}` refs
 * resolved against a recipe scope of `{ connection, input }` (see
 * `server/connectors/http.ts`). Refs use the SAME syntax as flow data-refs, but
 * a DIFFERENT scope — `{{ connection.apiKey }}`, `{{ input.chatId }}`.
 */
export interface HttpRequestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** full URL; may interpolate refs, e.g. "https://api.x.com/bot{{connection.token}}/send" */
  url: string
  /** static + templated headers. Values may contain refs. */
  headers?: Record<string, string>
  /** query params appended to the URL (templated values). */
  query?: Record<string, string>
  bodyType?: BodyType
  /**
   * Request body. For json/form: an object whose values are templated (a value
   * that is exactly one ref keeps its resolved type, so numbers stay numbers).
   * For text: a single templated string. Ignored when bodyType is "none".
   */
  body?: Record<string, unknown> | string
}

/**
 * Maps the HTTP response into the action's output object. Each entry is one
 * output key → a source expression:
 *  - "$.path.to.field"  → JSONPath-lite read from the parsed JSON response body
 *                         (dot path; supports [n] array indexes)
 *  - "=<literal>"       → a constant (e.g. "=true"); parsed as JSON, falling
 *                         back to the raw string
 *  - "$status"          → the numeric HTTP status code
 *  - "$ok"              → boolean: was the status 2xx
 *  - "$body"            → the whole parsed body (or raw text if not JSON)
 *
 * If omitted, the action returns `{ status, ok, body }`.
 */
export type OutputMapping = Record<string, string>

export interface ConnectorAction {
  id: string
  name: string
  description?: string
  needsConnection?: boolean
  inputSchema: FieldSchema[]
  /** keys this action emits — derived from `output` if absent */
  outputKeys?: string[]
  request: HttpRequestSpec
  output?: OutputMapping
}

/**
 * A test-connection recipe: a cheap, read-only request whose success (2xx)
 * means the credentials work. Optional.
 */
export interface ConnectorTest {
  request: HttpRequestSpec
  /** message shown on success; may interpolate response refs via `output`-style */
  okMessage?: string
}

export interface ConnectorDef {
  /** must equal CONNECTOR_SCHEMA_VERSION */
  schemaVersion: number
  /**
   * Connector id. User connectors are namespaced with an `x-` prefix at
   * registration time to guarantee they can never shadow a built-in id.
   */
  id: string
  name: string
  /** optional author/version/source metadata for the marketplace; informational */
  meta?: { author?: string, version?: string, homepage?: string, description?: string }
  icon?: string
  img?: string
  connectionSchema: FieldSchema[]
  actions: ConnectorAction[]
  test?: ConnectorTest
}
