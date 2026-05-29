<script setup lang="ts">
import type { PublicBoard, SnapshotResponse } from '~/types'

const props = defineProps<{
  boardSlug: string
  monitor: PublicBoard['monitors'][number]
}>()

const response = ref<SnapshotResponse | null>(null)
const loading = ref(false)

const snapshot = computed(() => (response.value?.ok ? response.value : null))
const error = computed(() => (response.value && !response.value.ok ? response.value.error : null))

const STATUS_COLOR = {
  up: 'success',
  down: 'error',
  pending: 'warning',
  maintenance: 'info',
  unknown: 'neutral'
} as const

function gaugeColor(p: number | null | undefined): 'success' | 'warning' | 'error' | 'neutral' {
  if (p == null) return 'neutral'
  return p >= 90 ? 'error' : p >= 75 ? 'warning' : 'success'
}

async function load() {
  if (!props.monitor.publicVisible) {
    response.value = null
    return
  }

  loading.value = true
  try {
    response.value = await $fetch<SnapshotResponse>(
      `/api/public/boards/${props.boardSlug}/monitors/${props.monitor.id}/snapshot`
    )
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage
      || (e as { message?: string })?.message
    response.value = { ok: false, error: msg || 'Failed to fetch snapshot' }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.boardSlug, props.monitor.id, props.monitor.publicVisible],
  () => { load() },
  { immediate: true }
)
</script>

<template>
  <UCard
    class="h-full"
    :ui="{ body: 'flex h-full flex-col gap-3' }"
  >
    <div class="flex items-center gap-2 font-medium text-highlighted">
      <UIcon
        name="i-lucide-activity"
        class="size-4 shrink-0 text-dimmed"
      />
      <span class="truncate">{{ monitor.name }}</span>
    </div>

    <p
      v-if="!monitor.publicVisible"
      class="mt-auto text-xs text-dimmed"
    >
      Live metrics are private.
    </p>

    <p
      v-else-if="error"
      class="mt-auto text-xs text-error"
    >
      {{ error }}
    </p>

    <div
      v-else-if="snapshot?.kind === 'gauges'"
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
        class="text-xs text-dimmed"
      >
        {{ snapshot.detail }}
      </p>
    </div>

    <div
      v-else-if="snapshot?.kind === 'status'"
      class="mt-auto flex items-center gap-2"
    >
      <UBadge
        :color="STATUS_COLOR[snapshot.state]"
        variant="soft"
      >
        {{ snapshot.label }}
      </UBadge>
      <span
        v-if="snapshot.detail"
        class="text-xs text-dimmed"
      >
        {{ snapshot.detail }}
      </span>
    </div>

    <p
      v-else-if="loading"
      class="mt-auto text-xs text-dimmed"
    >
      Loading…
    </p>

    <p
      v-else
      class="mt-auto text-xs text-dimmed"
    >
      No data yet.
    </p>
  </UCard>
</template>
