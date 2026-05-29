import type { IntegrationMeta } from '~/types'

// The integration catalog (connection/action/trigger schemas). Fetched once and
// shared; everything in the builder + connections UI renders from this.
export function useCatalog() {
  return useFetch<IntegrationMeta[]>('/api/integrations', {
    key: 'integrations',
    default: () => []
  })
}

export function findIntegration(catalog: IntegrationMeta[], id: string) {
  return catalog.find(i => i.id === id)
}
