import { onMounted, onUnmounted, ref } from 'vue'

export interface Mapping {
  fqdn: string
  kumaMonitor: string
  bunnyZoneId: number
  recordName: string
  ips: string[]
  healthPath?: string
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

export interface IpEntry {
  address: string
  present: boolean
}

export interface Snapshot {
  kumaStatus?: number
  kumaMonitor?: string
  activeIp?: string
  ips?: IpEntry[]
  failures?: number
  lastSwitchAt?: number | null
  bunnyError?: string | null
}

export interface MonitorSnapshot {
  name: string
  status: number
  mapped: boolean
}

export interface StatusData {
  startedAt: number
  lastTickAt: number | null
  lastTriggerAt: number | null
  lastKumaError: string | null
  cooldownMs: number
  pollIntervalMs: number
  failThreshold: number
  mappings: Record<string, Snapshot>
  monitors: MonitorSnapshot[]
  history: Record<string, Array<{ ts: number, kuma: number | undefined }>>
}

const empty: StatusData = {
  startedAt: 0,
  lastTickAt: null,
  lastTriggerAt: null,
  lastKumaError: null,
  cooldownMs: 300_000,
  pollIntervalMs: 30_000,
  failThreshold: 2,
  mappings: {},
  monitors: [],
  history: {}
}

export async function useStatus(intervalMs = 5000) {
  const offline = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  async function poll() {
    try {
      data.value = await $fetch<StatusData>('/api/status')
      offline.value = false
    } catch {
      offline.value = true
    }
  }

  // Lifecycle hooks must be registered before the first `await` below, or Vue
  // can't bind them to the component instance in async setup.
  onMounted(() => {
    // SSR payload is already hydrated; start polling for live updates.
    timer = setInterval(poll, intervalMs)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  // SSR-fetched on the server so the initial snapshot (mappings + monitors)
  // is in the first paint; $fetch runs in-process during SSR, no real HTTP.
  // Awaiting here makes Nuxt block SSR until the snapshot resolves, so the
  // HTML ships with data rather than the empty default.
  const { data } = await useAsyncData<StatusData>(
    'status',
    () => $fetch('/api/status'),
    { default: () => empty }
  )

  return { data, offline, refresh: poll }
}
