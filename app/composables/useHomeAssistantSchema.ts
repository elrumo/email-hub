import type { FieldSchema } from '~/types'

interface DiscoveredEntity {
  entityId: string
  friendlyName: string | null
  domain: string
}
interface DiscoveredServiceDomain {
  domain: string
  services: string[]
}
interface HomeAssistantCatalog {
  entities: DiscoveredEntity[]
  services: DiscoveredServiceDomain[]
}

const EMPTY: HomeAssistantCatalog = { entities: [], services: [] }

// Per-connection cache so opening several steps that share one HA connection
// hits the instance once. Mirrors useKumaMonitorSchema's caching.
const haCatalogCache = new Map<string, Promise<HomeAssistantCatalog> | HomeAssistantCatalog>()

async function fetchHomeAssistantCatalog(connectionId: string): Promise<HomeAssistantCatalog> {
  const cached = haCatalogCache.get(connectionId)
  if (cached) return await cached

  const pending = $fetch<HomeAssistantCatalog>(`/api/connections/${connectionId}/homeassistant-entities`)
    .then((res) => {
      haCatalogCache.set(connectionId, res)
      return res
    })
    .catch((error) => {
      haCatalogCache.delete(connectionId)
      throw error
    })

  haCatalogCache.set(connectionId, pending)
  return await pending
}

function entityLabel(e: DiscoveredEntity): string {
  return e.friendlyName ? `${e.friendlyName} · ${e.entityId}` : e.entityId
}

/**
 * Augments a Home Assistant action/trigger schema so its free-text fields
 * become pickers populated from the connected instance:
 *   - `entityId` → select of discovered entities (filtered to the chosen
 *     `domain` when the field exists, e.g. on "Call a service")
 *   - `domain`   → select of service domains the instance exposes
 *   - `service`  → select of services within the chosen `domain`
 * Falls back to plain text (with a hint) if discovery fails, and always keeps
 * the current value selectable so saved flows never lose a configured value.
 */
export function useHomeAssistantSchema(args: {
  enabled: Ref<boolean> | ComputedRef<boolean>
  connectionId: Ref<string | null | undefined> | ComputedRef<string | null | undefined>
  schema: Ref<FieldSchema[]> | ComputedRef<FieldSchema[]>
  values: Ref<Record<string, unknown>> | ComputedRef<Record<string, unknown>>
}) {
  const catalog = ref<HomeAssistantCatalog>(EMPTY)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  let requestId = 0

  watch(
    [() => args.enabled.value, () => args.connectionId.value],
    async ([enabled, connectionId]) => {
      const current = ++requestId
      catalog.value = EMPTY
      loadError.value = null

      if (!enabled || !connectionId) {
        loading.value = false
        return
      }

      loading.value = true
      try {
        const found = await fetchHomeAssistantCatalog(connectionId)
        if (current !== requestId) return
        catalog.value = found
      } catch (error) {
        if (current !== requestId) return
        loadError.value = (error as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage
          || (error as Error)?.message
          || 'Could not load entities from Home Assistant'
      } finally {
        if (current === requestId) loading.value = false
      }
    },
    { immediate: true }
  )

  // append the current value as a synthetic option so an already-configured
  // value (or one typed before discovery finished) stays selected
  function withCurrent(items: Array<{ label: string, value: string | number }>, key: string) {
    const current = String(args.values.value[key] ?? '').trim()
    if (current && !items.some(item => String(item.value) === current)) {
      items.push({ label: `${current} (current value)`, value: current })
    }
    return items
  }

  const hasDomainField = computed(() => args.schema.value.some(f => f.key === 'domain'))

  const entityOptions = computed(() => {
    let entities = catalog.value.entities
    // On actions that also pick a domain (Call a service), scope entities to it.
    const domain = String(args.values.value.domain ?? '').trim()
    if (hasDomainField.value && domain) entities = entities.filter(e => e.domain === domain)
    return withCurrent(entities.map(e => ({ label: entityLabel(e), value: e.entityId })), 'entityId')
  })

  const domainOptions = computed(() =>
    withCurrent(catalog.value.services.map(d => ({ label: d.domain, value: d.domain })), 'domain')
  )

  const serviceOptions = computed(() => {
    const domain = String(args.values.value.domain ?? '').trim()
    let items: Array<{ label: string, value: string }>
    if (domain) {
      const match = catalog.value.services.find(d => d.domain === domain)
      items = (match?.services ?? []).map(s => ({ label: s, value: s }))
    } else {
      // no domain chosen yet → offer every service, namespaced for clarity
      items = catalog.value.services.flatMap(d => d.services.map(s => ({ label: `${d.domain}.${s}`, value: s })))
    }
    return withCurrent(items, 'service')
  })

  function loaded(key: string): boolean {
    if (key === 'entityId') return catalog.value.entities.length > 0
    return catalog.value.services.length > 0
  }

  function placeholder(key: string, count: number): string {
    if (!args.connectionId.value) return 'Choose a connection first'
    if (loading.value) return 'Loading from Home Assistant…'
    if (count) return key === 'entityId' ? 'Choose an entity' : key === 'domain' ? 'Choose a domain' : 'Choose a service'
    return loaded(key) ? 'Nothing matched' : `No ${key === 'entityId' ? 'entities' : key === 'domain' ? 'domains' : 'services'} found`
  }

  const schema = computed<FieldSchema[]>(() =>
    args.schema.value.map((field) => {
      if (field.type !== 'string') return field
      if (field.key !== 'entityId' && field.key !== 'domain' && field.key !== 'service') return field

      if (loadError.value) {
        return { ...field, help: `${loadError.value}. You can still type the value manually.` }
      }

      const options = field.key === 'entityId'
        ? entityOptions.value
        : field.key === 'domain'
          ? domainOptions.value
          : serviceOptions.value

      return {
        ...field,
        type: 'select',
        options,
        placeholder: placeholder(field.key, options.length),
        help: !args.connectionId.value
          ? 'Pick a Home Assistant connection first, then choose from its live values.'
          : loading.value
            ? 'Loading from Home Assistant…'
            : options.length
              ? 'Discovered from the selected Home Assistant connection.'
              : (field.help ?? undefined)
      }
    })
  )

  return { schema, loading, loadError }
}
