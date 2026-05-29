<script setup lang="ts">
import type { PingState } from '~/composables/usePing'

const { state } = defineProps<{ state?: PingState }>()

const meta = computed(() => {
  const s = state
  if (!s || s.pending) return { cls: 'bg-warning animate-pulse', label: 'Checking…' }
  if (s.ok) return { cls: 'bg-success', label: `Up · ${s.latency}ms` }
  return { cls: 'bg-error', label: s.error ? `Down · ${s.error}` : 'Down' }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-xs text-muted"
    :title="meta.label"
  >
    <span
      class="size-2 rounded-full"
      :class="meta.cls"
    />
    {{ meta.label }}
  </span>
</template>
