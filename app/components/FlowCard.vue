<script setup lang="ts">
import type { Flow } from '~/types'
import { relTime } from '~/composables/format'

/**
 * A flow, rendered either as a row on the Flows page (`size: 'list'`) or as a
 * home-bento widget (`size: 'sm' | 'lg'`). The list row carries the full set of
 * controls (run / enable toggle / edit / delete); the widget body is a
 * `@container` whose icon, title, description, and button scale with the tile's
 * actual rendered width (container-query variants), with the description shown
 * only on a tall-enough tile. `WidgetTile` owns the card chrome for widgets, so
 * in widget mode this renders bare (no `UCard`).
 *
 * State and side effects live in the parent: this component emits `run`,
 * `toggle`, `edit`, and `delete`, and takes `running` for the run button's
 * loading state. `triggerSummary` is passed in so the parent can format it with
 * its own schedule helpers.
 */
const { flow, size = 'list', running = false, isTall = false, triggerSummary } = defineProps<{
  flow: Flow
  /** 'list' = Flows-page row; 'sm'/'lg' = bento widget body */
  size?: 'list' | 'sm' | 'lg'
  /** run button loading state, owned by the parent */
  running?: boolean
  /** widget-only: tile is tall enough to show the description */
  isTall?: boolean
  /** list-only: pre-formatted trigger/schedule summary */
  triggerSummary?: string
}>()

defineEmits<{ run: [], toggle: [], edit: [], delete: [], export: [] }>()

const isWidget = computed(() => size !== 'list')
const isLarge = computed(() => size === 'lg')
</script>

<template>
  <!-- widget body: no card chrome (WidgetTile provides it). A @container, so the
       icon / title / description / button scale with the tile's actual rendered
       width via container-query variants (@sm/@md). Height still gates the
       description via `isTall` (container queries can't measure height). -->
  <div
    v-if="isWidget"
    class="@container flex h-full flex-col gap-2"
  >
    <div class="flex items-start justify-between gap-2">
      <NuxtLink
        :to="`/flows/${flow.id}`"
        class="flex items-center gap-2 font-medium text-highlighted hover:text-primary @md:text-lg"
      >
        <span class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted @sm:size-9 @md:size-10">
          <UIcon
            name="i-lucide-workflow"
            class="size-4 @sm:size-4.5 @md:size-5"
          />
        </span>
        <span class="truncate">{{ flow.name }}</span>
      </NuxtLink>
      <UBadge
        :color="flow.enabled ? 'success' : 'neutral'"
        variant="soft"
        size="sm"
      >
        {{ flow.enabled ? 'On' : 'Off' }}
      </UBadge>
    </div>
    <p
      v-if="isTall && flow.description"
      class="text-sm text-muted @md:text-base"
      :class="isLarge ? 'line-clamp-3' : 'line-clamp-2'"
    >
      {{ flow.description }}
    </p>
    <p class="text-sm text-dimmed @md:text-base">
      last run {{ relTime(flow.lastRunAt) }}
    </p>
    <UButton
      icon="i-lucide-play"
      label="Run now"
      color="neutral"
      variant="soft"
      :size="isLarge ? 'md' : 'sm'"
      class="mt-auto self-start"
      :loading="running"
      @click="$emit('run')"
    />
  </div>

  <!-- list row on the Flows page -->
  <UCard
    v-else
    :ui="{ body: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4' }"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <NuxtLink
          :to="`/flows/${flow.id}`"
          class="truncate font-medium text-highlighted hover:text-primary"
        >
          {{ flow.name }}
        </NuxtLink>
        <UBadge
          :color="flow.enabled ? 'success' : 'neutral'"
          variant="soft"
          size="sm"
        >
          {{ flow.enabled ? 'Enabled' : 'Disabled' }}
        </UBadge>
      </div>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
        <UIcon
          name="i-lucide-zap"
          class="size-3.5"
        />
        {{ triggerSummary }}
        <span class="text-dimmed">·</span>
        <span class="text-dimmed">last run {{ relTime(flow.lastRunAt) }}</span>
      </p>
    </div>

    <div class="flex items-center gap-1 self-end sm:self-auto">
      <UButton
        icon="i-lucide-play"
        label="Run now"
        color="neutral"
        variant="soft"
        size="sm"
        :loading="running"
        @click="$emit('run')"
      />
      <USwitch
        :model-value="flow.enabled"
        @update:model-value="$emit('toggle')"
      />
      <UButton
        icon="i-lucide-pencil"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Edit"
        :to="`/flows/${flow.id}`"
      />
      <UButton
        icon="i-lucide-share-2"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Share / export"
        @click="$emit('export')"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="sm"
        aria-label="Delete"
        @click="$emit('delete')"
      />
    </div>
  </UCard>
</template>
