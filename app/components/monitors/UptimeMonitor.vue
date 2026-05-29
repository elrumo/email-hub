<script setup lang="ts">
import type { Monitor, MonitorSnapshot } from '../../types'

/**
 * An uptime monitor card (Uptime Kuma etc.): card shell + header + actions, with
 * a "status" body rendered as an up/down badge. The parent MonitorCard owns the
 * fetch and passes the resolved snapshot down. Status-only — no live detail view,
 * so the card isn't clickable.
 */
const props = defineProps<{
  monitor: Monitor
  icon?: string
  img?: string
  snapshot: Extract<MonitorSnapshot, { kind: 'status' }> | null
  error?: string
  loading?: boolean
}>()
defineEmits<{ edit: [], remove: [], refresh: [] }>()

const STATUS_COLOR = {
  up: 'success', down: 'error', pending: 'warning', maintenance: 'info', unknown: 'neutral'
} as const

// the Kuma group this monitor belongs to, persisted in targetConfig at add time
const group = computed(() => {
  const g = props.monitor.targetConfig?.group
  return typeof g === 'string' && g ? g : null
})
</script>

<template>
  <UCard
    variant="xs"
    class="transition-shadow"
  >
    <div class="flex flex-row gap-4 group w-full">
      <div class="relative flex items-start gap-3 w-full">
        <!-- Header -->
        <div class="flex flex-col items-start gap-1">
            <div class="flex flex-row items-center gap-2">
                <div 
                    class="flex items-center justify-center size-4 rounded-xl bg-elevated aspect-square overflow-hidden animate-pulse"
                    :class="{
                        'bg-success/10': snapshot ? snapshot.state === 'up' : 'bg-neutral',
                        'bg-error/10': snapshot ? snapshot.state === 'down' : 'bg-neutral',
                        'bg-warning/10': snapshot ? snapshot.state === 'pending' : 'bg-neutral',
                        'bg-info/10': snapshot ? snapshot.state === 'maintenance' : 'bg-neutral',
                        'bg-neutral/10': snapshot ? snapshot.state === 'unknown' : 'bg-neutral',
                    }"
                >
                    <span
                        class="size-2 rounded-full"
                        :class="{
                            'bg-success': snapshot ? snapshot.state === 'up' : 'bg-neutral',
                            'bg-error': snapshot ? snapshot.state === 'down' : 'bg-neutral',
                            'bg-warning': snapshot ? snapshot.state === 'pending' : 'bg-neutral',
                            'bg-info': snapshot ? snapshot.state === 'maintenance' : 'bg-neutral',
                            'bg-neutral': snapshot ? snapshot.state === 'unknown' : 'bg-neutral',
                        }"
                    />
                </div>
                <p class="text-sm font-medium text-highlighted">
                    {{ monitor.name }}
                </p>
            </div>

            <p
                v-if="group"
                class="text-xs text-dimmed"
            >
                {{ group }}
            </p>
        </div>

        <!-- Actions -->
        <div
          class="reveal-on-hover absolute top-1/2 -translate-y-1/2 -right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
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

        <!-- error -->
        <div
            v-if="error"
            class="text-sm text-error"
        >
            {{ error }}
        </div>

        <!-- status -->
        <div
            v-else-if="snapshot"
            class="flex items-center gap-2"
        >
            <span
            v-if="snapshot.detail"
            class="text-xs text-dimmed"
            >{{ snapshot.detail }}</span>
        </div>

        <!-- loading -->
        <div
            v-else-if="loading"
            class="text-xs text-dimmed"
        >
            Loading…
        </div>
      </div>
    </div>
  </UCard>
</template>
