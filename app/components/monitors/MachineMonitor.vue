<script setup lang="ts">
import type { Monitor, MonitorSnapshot } from '../../types'

/**
 * A machine-metrics monitor card (Dokploy etc.): card shell + header + actions,
 * with a "gauges" body rendered as labelled progress bars (CPU / memory / disk).
 * The parent MonitorCard owns the fetch and passes the resolved snapshot down;
 * this card is clickable to open the live detail slideover.
 */
defineProps<{
  monitor: Monitor
  icon?: string
  img?: string
  snapshot: Extract<MonitorSnapshot, { kind: 'gauges' }> | null
  error?: string
  loading?: boolean
}>()
defineEmits<{ edit: [], remove: [], open: [], refresh: [] }>()

function gaugeColor(p: number | null | undefined): 'success' | 'warning' | 'error' | 'neutral' {
  if (p == null) return 'neutral'
  return p >= 90 ? 'error' : p >= 75 ? 'warning' : 'success'
}
</script>

<template>
  <UCard
    variant="sm"
    class="transition-shadow"
    :class="snapshot ? 'cursor-pointer hover:ring-1 hover:ring-accented' : ''"
    role="button"
    tabindex="0"
    @click="snapshot && $emit('open')"
    @keydown.enter="snapshot && $emit('open')"
  >
    <div class="flex flex-col gap-4 group">
      <div class="relative flex items-start justify-between gap-3">
        <!-- Header -->
        <div class="flex items-start gap-3">
          <span class="flex items-center justify-center size-8 rounded-xl bg-elevated aspect-square overflow-hidden">
            <img
              v-if="img"
              :src="img"
              :alt="monitor.integrationId"
              class="size-4 object-contain"
            >
            <UIcon
              v-else
              :name="icon || 'i-lucide-activity'"
              class="size-4 text-muted"
            />
          </span>
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ monitor.name }}
            </p>
            <p class="text-xs text-dimmed capitalize">
              {{ monitor.integrationId }}
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div
          class="reveal-on-hover absolute -top-1 -right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          @click.stop
        >
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="loading"
            aria-label="Refresh"
            @click="$emit('refresh')"
          />
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Edit"
            @click="$emit('edit')"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            aria-label="Delete"
            @click="$emit('remove')"
          />
        </div>
      </div>

      <div>
        <!-- error -->
        <div
          v-if="error"
          class="text-sm text-error"
        >
          {{ error }}
        </div>

        <!-- gauges -->
        <div
          v-else-if="snapshot"
          class="space-y-3"
        >
          <div
            v-for="g in snapshot.gauges"
            :key="g.key"
            class="space-y-1"
          >
            <div class="flex items-center justify-between text-xs">
              <span class="flex items-center gap-1.5 text-muted">
                <UIcon
                  v-if="g.icon"
                  :name="g.icon"
                  class="size-3.5"
                />
                {{ g.label }}
              </span>
              <span class="font-medium text-highlighted tabular-nums">
                {{ g.value != null ? Math.round(g.value) : '—' }}%
              </span>
            </div>
            <UProgress
              :model-value="g.value != null ? Math.round(g.value) : 0"
              :color="gaugeColor(g.value)"
              size="sm"
            />
          </div>
          <p
            v-if="snapshot.detail"
            class="text-xs text-dimmed pt-0.5"
          >
            {{ snapshot.detail }} · click for live detail
          </p>
        </div>

        <div
          v-else-if="loading"
          class="text-sm text-dimmed"
        >
          Loading…
        </div>
        <div
          v-else
          class="text-sm text-dimmed"
        >
          No data yet.
        </div>
      </div>
    </div>
  </UCard>
</template>
