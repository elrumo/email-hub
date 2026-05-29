<script setup lang="ts">
import type { Monitor, MonitorSnapshot } from '../../types'

/**
 * A web-analytics monitor card (Plausible / Google Analytics): card shell +
 * header + actions, with a "stats" body rendered as a small grid of labelled
 * figures (visitors, pageviews, live users, …). Unlike gauges these are raw
 * numbers, not percentages, so each is shown verbatim with its optional unit.
 * The parent MonitorCard owns the fetch and passes the resolved snapshot down.
 */
defineProps<{
  monitor: Monitor
  icon?: string
  img?: string
  snapshot: Extract<MonitorSnapshot, { kind: 'stats' }> | null
  error?: string
  loading?: boolean
}>()
defineEmits<{ edit: [], remove: [], open: [], refresh: [] }>()

function fmt(value: number | string | null): string {
  if (value == null) return '—'
  if (typeof value === 'number') return value.toLocaleString()
  return value
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
              :name="icon || 'i-lucide-bar-chart-3'"
              class="size-4 text-muted"
            />
          </span>
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ monitor.name }}
            </p>
            <p class="text-xs text-dimmed capitalize">
              {{ monitor.integrationId.replace('-', ' ') }}
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

        <!-- stats -->
        <div
          v-else-if="snapshot"
          class="space-y-3"
        >
          <div class="grid grid-cols-2 gap-2">
            <div
              v-for="s in snapshot.stats"
              :key="s.key"
              class="rounded-md border border-default bg-elevated/10 p-2.5"
            >
              <span class="flex items-center gap-1.5 text-xs text-muted">
                <UIcon
                  v-if="s.icon"
                  :name="s.icon"
                  class="size-3.5"
                />
                {{ s.label }}
              </span>
              <span class="mt-0.5 block text-lg font-semibold text-highlighted tabular-nums">
                {{ fmt(s.value) }}<span
                  v-if="s.unit && s.value != null"
                  class="text-xs text-dimmed"
                > {{ s.unit }}</span>
              </span>
            </div>
          </div>
          <p
            v-if="snapshot.detail"
            class="text-xs text-dimmed pt-0.5"
          >
            {{ snapshot.detail }}
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
