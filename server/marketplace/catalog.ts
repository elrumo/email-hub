/**
 * The community marketplace catalog.
 *
 * For now this is an in-repo registry — a curated list of connector defs and
 * flow bundles the gallery shows and installs in one click. It's deliberately a
 * single source so the marketplace can later be swapped for a remote registry
 * URL (fetch + SSRF guard, same as install-from-URL) without touching the UI:
 * the endpoint shape stays `{ connectors[], flows[] }`.
 *
 * Connector entries embed the full `ConnectorDef` (installed via POST
 * /api/connectors with `{ def }`); flow entries embed a `FlowBundle` (imported
 * via the flow import flow). Both can instead point at a `url` for a remotely
 * hosted artifact.
 */

import { exampleConnectors } from '../connectors/examples'
import type { ConnectorDef } from '../connectors/types'
import type { FlowBundle } from '../flows/bundle'

export interface MarketplaceConnectorEntry {
  kind: 'connector'
  /** stable catalog id (distinct from the connector's own id) */
  slug: string
  title: string
  summary: string
  author?: string
  tags?: string[]
  icon?: string
  img?: string
  /** the connector itself, inline … */
  def?: ConnectorDef
  /** … or a URL to a raw ConnectorDef JSON (fetched on install) */
  url?: string
}

export interface MarketplaceFlowEntry {
  kind: 'flow'
  slug: string
  title: string
  summary: string
  author?: string
  tags?: string[]
  icon?: string
  /** the flow bundle inline … */
  bundle?: FlowBundle
  /** … or a URL to a raw FlowBundle JSON */
  url?: string
}

export type MarketplaceEntry = MarketplaceConnectorEntry | MarketplaceFlowEntry

/** Connector entries, seeded from the example connectors. */
const connectorEntries: MarketplaceConnectorEntry[] = exampleConnectors.map(def => ({
  kind: 'connector',
  slug: def.id,
  title: def.name,
  summary: def.meta?.description ?? `${def.actions.length} action${def.actions.length === 1 ? '' : 's'}`,
  author: def.meta?.author,
  icon: def.icon,
  img: def.img,
  tags: ['community'],
  def
}))

/** Flow bundle entries. Empty to start — flows are seeded as users publish. */
const flowEntries: MarketplaceFlowEntry[] = []

export function loadMarketplace(): { connectors: MarketplaceConnectorEntry[], flows: MarketplaceFlowEntry[] } {
  return { connectors: connectorEntries, flows: flowEntries }
}
