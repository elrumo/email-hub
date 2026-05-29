import type { FieldSchema } from '~/types'

interface KumaMonitor {
  name: string
  group: string | null
  status: number
}

const kumaMonitorCache = new Map<string, Promise<KumaMonitor[]> | KumaMonitor[]>()

async function fetchKumaMonitors(connectionId: string): Promise<KumaMonitor[]> {
  const cached = kumaMonitorCache.get(connectionId)
  if (cached) return await cached

  const pending = $fetch<{ monitors: KumaMonitor[] }>(`/api/connections/${connectionId}/kuma-monitors`)
    .then((res) => {
      kumaMonitorCache.set(connectionId, res.monitors)
      return res.monitors
    })
    .catch((error) => {
      kumaMonitorCache.delete(connectionId)
      throw error
    })

  kumaMonitorCache.set(connectionId, pending)
  return await pending
}

function monitorLabel(monitor: KumaMonitor): string {
  return monitor.group ? `${monitor.group} / ${monitor.name}` : monitor.name
}

export function useKumaMonitorSchema(args: {
  enabled: Ref<boolean> | ComputedRef<boolean>
  connectionId: Ref<string | null | undefined> | ComputedRef<string | null | undefined>
  schema: Ref<FieldSchema[]> | ComputedRef<FieldSchema[]>
  values: Ref<Record<string, unknown>> | ComputedRef<Record<string, unknown>>
}) {
  const monitors = ref<KumaMonitor[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  let requestId = 0

  watch(
    [() => args.enabled.value, () => args.connectionId.value],
    async ([enabled, connectionId]) => {
      const current = ++requestId
      monitors.value = []
      loadError.value = null

      if (!enabled || !connectionId) {
        loading.value = false
        return
      }

      loading.value = true
      try {
        const found = await fetchKumaMonitors(connectionId)
        if (current !== requestId) return
        monitors.value = found
      } catch (error) {
        if (current !== requestId) return
        loadError.value = (error as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage
          || (error as Error)?.message
          || 'Could not load monitors from Kuma'
      } finally {
        if (current === requestId) loading.value = false
      }
    },
    { immediate: true }
  )

  const monitorOptions = computed(() => {
    const items = monitors.value.map(m => ({ label: monitorLabel(m), value: m.name }))
    const current = String(args.values.value.monitor ?? '').trim()
    if (current && !items.some(item => item.value === current)) {
      items.push({ label: `${current} (current value)`, value: current })
    }
    return items
  })

  const schema = computed<FieldSchema[]>(() =>
    args.schema.value.map((field) => {
      if (field.key !== 'monitor' || field.type !== 'string') return field

      if (loadError.value) {
        return {
          ...field,
          help: `${loadError.value}. You can still type the exact monitor name manually.`
        }
      }

      return {
        ...field,
        type: 'select',
        options: monitorOptions.value,
        placeholder: !args.connectionId.value
          ? 'Choose a connection first'
          : loading.value
            ? 'Loading monitors...'
            : monitorOptions.value.length
              ? 'Choose a monitor'
              : 'No monitors found',
        help: !args.connectionId.value
          ? 'Pick a Kuma connection first, then choose one of its discovered monitors.'
          : loading.value
            ? 'Loading monitors from Uptime Kuma...'
            : monitorOptions.value.length
              ? 'Discovered from the selected Uptime Kuma connection.'
              : 'No monitors were returned by this Kuma connection.'
      }
    })
  )

  return { schema, loading, loadError, monitorOptions }
}
