<script setup lang="ts">
import type { Monitor, SnapshotResponse } from '../types'

/**
 * Live detailed view for one monitor, shown inside a USlideover. Polls the
 * snapshot endpoint while mounted. For "gauges" snapshots whose `raw` is the
 * Dokploy agent time-series, it renders gauges + sparklines + network + system
 * info; for "status" snapshots it renders a status panel. Stops on unmount.
 */
const props = defineProps<{ monitor: Monitor }>()

/** One raw Dokploy agent sample (present in gauges snapshots from Dokploy). */
interface AgentSample {
  cpu?: string
  cpuModel?: string
  cpuCores?: number
  cpuPhysicalCores?: number
  cpuSpeed?: number
  os?: string
  distro?: string
  kernel?: string
  arch?: string
  memUsed?: string
  memUsedGB?: string
  memTotal?: string
  uptime?: number
  diskUsed?: string
  totalDisk?: string
  networkIn?: string
  networkOut?: string
  timestamp?: string
}

const REFRESH_MS = 5000
const snapshot = ref<SnapshotResponse | null>(null)
const loading = ref(false)
const lastUpdated = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  loading.value = true
  try {
    snapshot.value = await $fetch<SnapshotResponse>(`/api/monitors/${props.monitor.id}/snapshot`)
    lastUpdated.value = Date.now()
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage
      || (e as { message?: string })?.message
    snapshot.value = { ok: false, error: msg || 'Failed to fetch snapshot' }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = setInterval(load, REFRESH_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const num = (v: string | number | undefined | null): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const isGauges = computed(() => snapshot.value?.ok && snapshot.value.kind === 'gauges')
const isStatus = computed(() => snapshot.value?.ok && snapshot.value.kind === 'status')

/** One recorded ping (present in a constant-ping monitor's status snapshot raw). */
interface PingSample { ts: number, latencyMs: number | null, ok: boolean, status: number }

// constant-ping monitors attach their recent samples as raw.samples; extract
// the latency series + summary so the status panel can show a live sparkline.
const pingSamples = computed<PingSample[]>(() => {
  const s = snapshot.value
  if (!s?.ok || s.kind !== 'status') return []
  const raw = s.raw as { samples?: unknown } | undefined
  return Array.isArray(raw?.samples) ? (raw.samples as PingSample[]) : []
})
const hasPingSeries = computed(() => pingSamples.value.length > 0)
const latencySeries = computed(() =>
  pingSamples.value.map(p => p.latencyMs).filter((v): v is number => v != null)
)
const lastLatency = computed(() => latencySeries.value.at(-1) ?? null)
const avgLatency = computed(() => {
  const v = latencySeries.value
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
})
const pingSuccessRate = computed(() => {
  const s = pingSamples.value
  if (!s.length) return null
  return Math.round((s.filter(p => p.ok).length / s.length) * 100)
})

// Dokploy agent time-series, if the gauges snapshot carries it as `raw`.
const series = computed<AgentSample[]>(() => {
  const s = snapshot.value
  if (!s?.ok || s.kind !== 'gauges') return []
  return Array.isArray(s.raw) ? (s.raw as AgentSample[]) : []
})
const latest = computed<AgentSample | null>(() => series.value.at(-1) ?? null)

function pick(field: keyof AgentSample): number[] {
  return series.value.map(s => num(s[field] as string)).filter((v): v is number => v != null)
}

const cpuSeries = computed(() => pick('cpu'))
const memSeries = computed(() => pick('memUsed'))

// networkIn/Out are CUMULATIVE MB since boot (gopsutil BytesRecv/Sent), not a
// rate. A monotonically-increasing counter is meaningless to plot, so convert
// to MB/s from consecutive samples using their timestamps. The first sample has
// no predecessor and is dropped; counter resets (reboot) clamp to 0.
function rateSeries(field: 'networkIn' | 'networkOut'): number[] {
  const out: number[] = []
  for (let i = 1; i < series.value.length; i++) {
    const cur = num(series.value[i]![field])
    const prev = num(series.value[i - 1]![field])
    const dt = (Date.parse(series.value[i]!.timestamp ?? '') - Date.parse(series.value[i - 1]!.timestamp ?? '')) / 1000
    if (cur != null && prev != null && Number.isFinite(dt) && dt > 0) {
      out.push(Math.max(0, (cur - prev) / dt))
    }
  }
  return out
}
const netInSeries = computed(() => rateSeries('networkIn'))
const netOutSeries = computed(() => rateSeries('networkOut'))
const netInRate = computed(() => netInSeries.value.at(-1) ?? null)
const netOutRate = computed(() => netOutSeries.value.at(-1) ?? null)
function fmtRate(mbPerSec: number | null): string {
  if (mbPerSec == null) return '—'
  if (mbPerSec < 1) return `${Math.round(mbPerSec * 1024)} KB/s`
  return `${mbPerSec.toFixed(1)} MB/s`
}
// NOTE: the Dokploy agent's `diskUsed` is the USED PERCENT of `/`, NOT
// gigabytes; `totalDisk` is the partition size in GB. So used% is `diskUsed`
// directly and the GB figures are derived from it (mirrors the server's
// dokploy.metrics computation). Using `diskUsed/totalDisk` here would be wrong.
const diskSeries = computed(() => {
  return series.value
    .map(s => num(s.diskUsed))
    .filter((v): v is number => v != null)
})

const cpu = computed(() => num(latest.value?.cpu))
const mem = computed(() => num(latest.value?.memUsed))
const disk = computed(() => num(latest.value?.diskUsed))
const diskTotal = computed(() => num(latest.value?.totalDisk))
const diskUsage = computed(() => {
  const t = diskTotal.value
  const p = disk.value
  return t != null && p != null ? Math.round(t * p) / 100 : null
})
const diskFree = computed(() => {
  const t = diskTotal.value
  const u = diskUsage.value
  return t != null && u != null ? Math.round((t - u) * 100) / 100 : 100
})

function gaugeColor(p: number | null, inverted?: boolean): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  if (p == null) return 'neutral'
  if (inverted) {
    switch (true) {
      case p >= 90:
        return 'success'
      case p >= 75:
        return 'info'
      case p >= 35:
        return 'warning'
      case p >= 25:
        return 'error'
      default:
        return 'neutral'
    }
  }

  switch (true) {
    case p >= 90:
      return 'error'
    case p >= 75:
      return 'warning'
    case p >= 35:
      return 'info'
    case p >= 25:
      return 'success'
    default:
      return 'neutral'
  }
}

function fmtUptime(secs: number | undefined): string {
  if (!secs) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}m`].filter(Boolean).join(' ')
}

function percentage(p: number | null, total: number | null, asNumber?: boolean): string | number {
  if (p == null || total == null || total === 0) return asNumber ? '—' : 0
  console.log('asNumber: ', asNumber)
  return asNumber ? ((p / total) * 100).toFixed(2) : `${((p / total) * 100).toFixed(2)}%`
}

const sysInfo = computed(() => {
  const l = latest.value
  if (!l) return []
  return [
    { label: 'OS', value: l.distro || l.os || '—' },
    { label: 'Kernel', value: l.kernel || '—' },
    { label: 'Arch', value: l.arch || '—' },
    { label: 'CPU', value: l.cpuModel || '—' },
    { label: 'Cores', value: l.cpuCores != null ? `${l.cpuCores} (${l.cpuPhysicalCores} physical)` : '—' },
    { label: 'CPU speed', value: l.cpuSpeed != null ? `${l.cpuSpeed} MHz` : '—' },
    { label: 'Uptime', value: fmtUptime(l.uptime) }
  ]
})

const updatedAgo = computed(() => {
  if (!lastUpdated.value) return ''
  return new Date(lastUpdated.value).toLocaleTimeString()
})
</script>

<template>
  <div class="space-y-6">
    <!-- error / loading states -->
    <div
      v-if="snapshot && !snapshot.ok"
      class="text-sm text-error"
    >
      {{ snapshot.error }}
    </div>
    <div
      v-else-if="!snapshot && loading"
      class="text-sm text-dimmed"
    >
      Loading live data…
    </div>

    <!-- status snapshot -->
    <template v-else-if="isStatus && snapshot?.ok && snapshot.kind === 'status'">
      <div class="rounded-md border border-default bg-elevated/10 p-4 flex items-center gap-3">
        <span
          class="size-3 rounded-full"
          :class="{
            'bg-success': snapshot.state === 'up',
            'bg-error': snapshot.state === 'down',
            'bg-warning': snapshot.state === 'pending',
            'bg-info': snapshot.state === 'maintenance',
            'bg-neutral': snapshot.state === 'unknown'
          }"
        />
        <div>
          <p class="text-sm font-medium text-highlighted">
            {{ snapshot.label }}
          </p>
          <p
            v-if="snapshot.detail"
            class="text-xs text-dimmed"
          >
            {{ snapshot.detail }}
          </p>
        </div>
      </div>

      <!-- constant-ping latency: live response-time sparkline + summary -->
      <div
        v-if="hasPingSeries"
        class="rounded-md border border-default bg-elevated/10 p-3 space-y-2"
      >
        <div class="flex items-baseline justify-between">
          <span class="text-xs text-muted">Response time</span>
          <span class="text-lg font-semibold text-highlighted tabular-nums">
            {{ lastLatency != null ? lastLatency : '—' }}<span class="text-xs text-dimmed"> ms</span>
          </span>
        </div>
        <MetricSparkline
          :values="latencySeries"
          :color="snapshot.state === 'up' ? 'success' : 'error'"
          :min="0"
          :height="40"
        />
        <div class="flex items-center justify-between text-xs text-dimmed">
          <span>avg {{ avgLatency != null ? `${avgLatency} ms` : '—' }}</span>
          <span>{{ pingSuccessRate != null ? `${pingSuccessRate}% up` : '' }} · {{ pingSamples.length }} pings</span>
        </div>
      </div>
    </template>

    <!-- gauges snapshot without a rich Dokploy series → simple bars -->
    <template v-else-if="isGauges && !latest && snapshot?.ok && snapshot.kind === 'gauges'">
      <div class="space-y-3">
        <div
          v-for="g in snapshot.gauges"
          :key="g.key"
          class="space-y-1"
        >
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted">{{ g.label }}</span>
            <span class="font-medium text-highlighted tabular-nums">{{ g.value != null ? Math.round(g.value) : '—' }}%</span>
          </div>
          <UProgress
            :model-value="g.value != null ? Math.round(g.value) : 0"
            :color="gaugeColor(g.value)"
            size="sm"
          />
        </div>
      </div>
    </template>

    <!-- rich Dokploy series -->
    <template v-else-if="latest">
      <!-- gauges -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="g in [
            { key: 'cpu', label: 'CPU', value: cpu, sub: latest.cpuCores ? `${latest.cpuCores} cores` : '', s: cpuSeries },
            { key: 'mem', label: 'Memory', value: mem, sub: `${latest.memUsedGB} / ${latest.memTotal} GB`, s: memSeries },
            { key: 'disk', label: 'Disk', value: disk, sub: `${diskFree} GB free`, s: diskSeries }
          ]"
          :key="g.key"
          class="rounded-md border border-default bg-elevated/10 p-3 space-y-2"
        >
          <div class="flex items-baseline justify-between">
            <span class="text-xs text-muted">{{ g.label }}</span>
            <span class="text-lg font-semibold text-highlighted tabular-nums">
              {{ g.value != null ? Math.round(g.value) : '—' }}<span class="text-xs text-dimmed">%</span>
            </span>
          </div>
          <UProgress
            :model-value="g.value != null ? Math.round(g.value) : 0"
            :color="gaugeColor(g.value)"
            size="sm"
          />
          <MetricSparkline
            :values="g.s"
            :color="gaugeColor(g.value)"
            :min="0"
            :max="100"
            :height="40"
          />
          <p class="text-xs text-dimmed">
            {{ g.sub }}
          </p>
        </div>
      </div>

      <!-- network -->
      <div>
        <h4 class="text-xs font-medium text-muted mb-2">
          Network throughput
        </h4>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-md border border-default bg-elevated/10 p-3 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted flex items-center gap-1">
                <UIcon
                  name="i-lucide-arrow-down"
                  class="size-3"
                /> In
              </span>
              <span class="text-sm font-medium text-highlighted tabular-nums">{{ fmtRate(netInRate) }}</span>
            </div>
            <MetricSparkline
              :values="netInSeries"
              color="info"
              :min="0"
              :height="32"
            />
          </div>

          <div class="rounded-md border border-default bg-elevated/10 p-3 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted flex items-center gap-1">
                <UIcon
                  name="i-lucide-arrow-up"
                  class="size-3"
                /> Out
              </span>
              <span class="text-sm font-medium text-highlighted tabular-nums">{{ fmtRate(netOutRate) }}</span>
            </div>
            <MetricSparkline
              :values="netOutSeries"
              color="primary"
              :min="0"
              :height="32"
            />
          </div>
        </div>
      </div>

      <!-- disk detail -->
      <div class="flex flex-col gap-0">
        <h4 class="text-xs font-medium text-muted mb-2">
          Disk usage
        </h4>

        <div class="flex flex-row gap-3">
          <div class="flex-1 rounded-md border border-default bg-elevated/10 p-3 flex flex-col items-baseline text-sm relative">
            <span class="text-muted">
              Disk usage
              <span class="text-xs text-dimmed">
                {{ percentage(diskUsage, diskTotal) }}
              </span>
            </span>
            <span class="font-medium text-highlighted">
              {{ diskUsage }} GB <span class="text-dimmed">/ {{ diskTotal }} GB</span>
            </span>

            <UProgress
              v-model="diskUsage"
              class="mt-2"
              :color="gaugeColor(percentage(diskUsage, diskTotal, true) ? Number(percentage(diskUsage, diskTotal, true)) : 0, false)"
              :max="diskTotal ? diskTotal : 0"
              size="sm"
            />
          </div>

          <div class="flex-1 rounded-md border border-default bg-elevated/10 p-3 flex flex-col items-baseline text-sm relative">
            <span class="text-muted">
              Disk free
              <span class="text-xs text-dimmed">
                {{ percentage(diskFree, diskTotal) }}
              </span>
            </span>

            <span class="font-medium text-highlighted">
              {{ diskFree }} GB <span class="text-dimmed">/ {{ diskTotal }} GB</span>
            </span>

            <UProgress
              v-model="diskFree"
              class="mt-2"
              :color="gaugeColor(percentage(diskFree, diskTotal, true) ? 100 - Number(percentage(diskFree, diskTotal, true)) : 0, true)"
              :max="diskTotal ? diskTotal : 100"
              size="sm"
            />
          </div>
        </div>
      </div>

      <!-- system info -->
      <div>
        <h4 class="text-xs font-medium text-muted mb-2">
          System
        </h4>
        <dl class="rounded-md border border-default divide-y divide-default overflow-hidden">
          <div
            v-for="row in sysInfo"
            :key="row.label"
            class="flex items-center justify-between gap-4 px-3 py-2 text-sm"
          >
            <dt class="text-muted shrink-0">
              {{ row.label }}
            </dt>
            <dd class="text-highlighted text-right truncate">
              {{ row.value }}
            </dd>
          </div>
        </dl>
      </div>
    </template>

    <div
      v-else
      class="text-sm text-dimmed"
    >
      No data yet.
    </div>

    <p class="text-xs text-dimmed text-right">
      <span v-if="loading">Refreshing…</span>
      <span v-else-if="updatedAgo">Updated {{ updatedAgo }} · auto every {{ REFRESH_MS / 1000 }}s</span>
    </p>
  </div>
</template>
