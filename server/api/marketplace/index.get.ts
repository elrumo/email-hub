import { loadMarketplace } from '../../marketplace/catalog'
import { userIntegrationId } from '../../connectors/compile'
import { hasIntegration } from '../../engine/registry'
import { registerAllIntegrations } from '../../integrations'

/**
 * The marketplace gallery feed. Returns curated connector + flow entries, each
 * annotated with whether it's already installed (so the UI can show "Installed"
 * vs "Install"). Connector entries are matched by their `x-<id>` integration id;
 * flow entries can't be "installed" idempotently, so they're always actionable.
 */
export default defineEventHandler(() => {
  registerAllIntegrations()
  const { connectors, flows } = loadMarketplace()

  return {
    connectors: connectors.map((c) => {
      const connectorId = c.def?.id ?? c.slug
      return {
        kind: c.kind,
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        author: c.author,
        tags: c.tags ?? [],
        icon: c.icon,
        img: c.img,
        // only the metadata + (optional) url go to the client; the full def is
        // installed server-side from the catalog by slug to keep payloads small
        hasUrl: !!c.url,
        actionCount: c.def?.actions.length ?? 0,
        installed: hasIntegration(userIntegrationId(connectorId))
      }
    }),
    flows: flows.map(f => ({
      kind: f.kind,
      slug: f.slug,
      title: f.title,
      summary: f.summary,
      author: f.author,
      tags: f.tags ?? [],
      icon: f.icon,
      hasUrl: !!f.url,
      requires: f.bundle?.connectors ?? []
    }))
  }
})
