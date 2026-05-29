<script setup lang="ts">
import { computed } from 'vue'
import { STATUS_LABELS, UNKNOWN } from '~/composables/format'
import type { MonitorSnapshot } from '~/composables/useStatus'

const props = defineProps<{
  monitors: MonitorSnapshot[]
}>()

const sorted = computed(() =>
  [...props.monitors].sort((a, b) => a.name.localeCompare(b.name))
)
const downCount = computed(
  () => props.monitors.filter(m => m.status === 0).length
)

function statusLabel(status: number) {
  return STATUS_LABELS[status] ?? UNKNOWN
}

const DOT: Record<string, string> = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
  neutral: 'bg-muted'
}
const TEXT: Record<string, string> = {
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
  neutral: 'text-dimmed'
}
function dot(status: number) {
  return DOT[statusLabel(status).color ?? 'neutral'] ?? 'bg-muted'
}
function text(status: number) {
  return TEXT[statusLabel(status).color ?? 'neutral'] ?? 'text-dimmed'
}
</script>

<template>
  <UCard
    variant="subtle"
    :ui="{ body: 'sm:p-6 space-y-4' }"
  >
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-sm font-semibold tracking-tight text-highlighted">
        Kuma Monitors
      </h3>
      <span class="font-mono text-xs tabular-nums text-dimmed">
        <span
          v-if="downCount"
          class="text-error"
        >{{ downCount }} down · </span>{{ monitors.length }} total
      </span>
    </div>

    <div
      v-if="monitors.length === 0"
      class="text-sm text-dimmed"
    >
      No monitors reported by Kuma
    </div>

    <div
      v-else
      class="-mx-2 flex flex-col"
    >
      <div
        v-for="m in sorted"
        :key="m.name"
        class="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-elevated/50"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span
            class="size-1.5 shrink-0 rounded-full"
            :class="dot(m.status)"
          />
          <span
            class="truncate"
            :class="m.mapped ? 'text-highlighted' : 'text-muted'"
          >{{ m.name }}</span>
          <UIcon
            v-if="m.mapped"
            name="i-lucide-link"
            class="size-3 shrink-0 text-dimmed"
            title="Mapped"
          />
        </span>
        <span
          class="shrink-0 text-xs font-medium capitalize"
          :class="text(m.status)"
        >
          {{ statusLabel(m.status).label.toLowerCase() }}
        </span>
      </div>
    </div>
  </UCard>
</template>
