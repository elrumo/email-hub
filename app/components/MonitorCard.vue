<script setup lang="ts">
import AnalyticsMonitor from './monitors/AnalyticsMonitor.vue'
import MachineMonitor from './monitors/MachineMonitor.vue'
import UptimeMonitor from './monitors/UptimeMonitor.vue'

import type { Monitor, SnapshotResponse } from '../types'

/**
 * Dispatcher for one monitor on the Monitoring page. Owns the snapshot fetch and
 * routes to the per-kind card that owns the full shell (header, actions, body):
 * Dokploy → MachineMonitor (gauges), Uptime Kuma → UptimeMonitor (status),
 * Plausible / Google Analytics → AnalyticsMonitor (stats).
 */

const ANALYTICS_INTEGRATIONS = ['plausible', 'google-analytics']
const props = defineProps<{
  monitor: Monitor
  /** iconify icon / image for the integration, shown in the card header */
  icon?: string
  img?: string
}>()
defineEmits<{ edit: [], remove: [], open: [] }>()

const response = ref<SnapshotResponse | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    response.value = await $fetch<SnapshotResponse>(`/api/monitors/${props.monitor.id}/snapshot`)
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage
      || (e as { message?: string })?.message
    response.value = { ok: false, error: msg || 'Failed to fetch snapshot' }
  } finally {
    loading.value = false
  }
}
onMounted(load)

// the successful snapshot (data) and the error string, split for the child cards
const snapshot = computed(() => (response.value?.ok ? response.value : null))
const error = computed(() => (response.value && !response.value.ok ? response.value.error : undefined))
</script>

<template>
  <MachineMonitor
    v-if="monitor.integrationId === 'dokploy'"
    :monitor="monitor"
    :icon="icon"
    :img="img"
    :snapshot="snapshot?.kind === 'gauges' ? snapshot : null"
    :error="error"
    :loading="loading"
    @refresh="load"
    @edit="$emit('edit')"
    @remove="$emit('remove')"
    @open="$emit('open')"
  />
  <UptimeMonitor
    v-else-if="monitor.integrationId === 'kuma'"
    :monitor="monitor"
    :icon="icon"
    :img="img"
    :snapshot="snapshot?.kind === 'status' ? snapshot : null"
    :error="error"
    :loading="loading"
    @refresh="load"
    @edit="$emit('edit')"
    @remove="$emit('remove')"
  />
  <AnalyticsMonitor
    v-else-if="ANALYTICS_INTEGRATIONS.includes(monitor.integrationId)"
    :monitor="monitor"
    :icon="icon"
    :img="img"
    :snapshot="snapshot?.kind === 'stats' ? snapshot : null"
    :error="error"
    :loading="loading"
    @refresh="load"
    @edit="$emit('edit')"
    @remove="$emit('remove')"
    @open="$emit('open')"
  />
</template>
