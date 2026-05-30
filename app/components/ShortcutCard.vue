<script setup lang="ts">
import type { PingState } from '~/composables/usePing'
import type { Shortcut } from '~/types'

/**
 * A shortcut, rendered either as a row on the Shortcuts page (`size: 'list'`)
 * or as a home-bento widget (`size: 'sm' | 'lg'`). The widget body drops the
 * inline edit/delete controls and is a `@container`: its icon, text, and gaps
 * scale with the tile's actual rendered width via container-query variants
 * (`@sm`/`@md`), so it adapts smoothly instead of snapping at a coarse bucket.
 * `WidgetTile` owns the card chrome for widgets, so in widget mode this renders
 * bare (no `UCard`). The `size` prop is kept for the list/widget split.
 */
const { shortcut, ping, size = 'list' } = defineProps<{
  shortcut: Shortcut
  /** live ping state, when the parent is polling */
  ping?: PingState
  /** 'list' = Shortcuts-page row; 'sm'/'lg' = bento widget body */
  size?: 'list' | 'sm' | 'lg'
}>()

defineEmits<{ edit: [], delete: [] }>()

const isWidget = computed(() => size !== 'list')

// strip protocol for a compact display host
const host = computed(() => {
  try {
    return new URL(shortcut.url).host
  } catch {
    return shortcut.url
  }
})
</script>

<template>
  <!-- widget body: no card chrome (WidgetTile provides it). A @container, so its
       icon / text / gaps scale with the tile's actual rendered width rather than
       a coarse grid-span bucket. Below @sm it stays a tight horizontal row; from
       @sm up it stacks vertically and grows. -->
  <div
    v-if="isWidget"
    class="@container group flex h-full flex-col gap-2"
  >
    <a
      :href="shortcut.url"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-2.5 text-highlighted hover:text-primary @sm:flex-col @sm:items-start @sm:gap-3"
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-elevated text-muted @sm:size-11 @md:size-12">
        <img
          v-if="isImageIcon(shortcut.icon)"
          :src="shortcut.icon"
          alt=""
          class="size-5 rounded @sm:size-6 @md:size-7"
        >
        <UIcon
          v-else
          :name="shortcut.icon || 'i-lucide-link'"
          class="size-5 @sm:size-6 @md:size-7"
        />
      </span>
      <span class="min-w-0">
        <span class="flex items-center gap-1 font-medium @md:text-lg">
          <span class="truncate">{{ shortcut.name }}</span>
          <UIcon
            name="i-lucide-arrow-up-right"
            class="size-3.5 shrink-0 text-dimmed transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary @md:size-4"
          />
        </span>
        <span class="block truncate text-sm text-dimmed @md:text-base">{{ host }}</span>
      </span>
    </a>
    <PingDot
      v-if="shortcut.pingEnabled"
      :state="ping"
      class="mt-auto"
    />
  </div>

  <!-- list row on the Shortcuts page -->
  <UCard
    v-else
    variant="sm"
    :ui="{ body: 'flex items-center gap-3' }"
  >
    <div class="group flex w-full items-center gap-3">
      <a
        :href="shortcut.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated text-muted transition-colors hover:text-primary"
      >
        <img
          v-if="isImageIcon(shortcut.icon)"
          :src="shortcut.icon"
          alt=""
          class="size-5 rounded"
        >
        <UIcon
          v-else
          :name="shortcut.icon || 'i-lucide-link'"
          class="size-5"
        />
      </a>

      <div class="min-w-0 flex-1">
        <a
          :href="shortcut.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 truncate font-medium text-highlighted hover:text-primary"
        >
          <span class="truncate">{{ shortcut.name }}</span>
          <UIcon
            name="i-lucide-external-link"
            class="size-3.5 shrink-0 text-dimmed"
          />
        </a>
        <p class="mt-0.5 flex items-center gap-2 text-sm text-muted">
          <span class="truncate text-dimmed">{{ host }}</span>
          <PingDot
            v-if="shortcut.pingEnabled"
            :state="ping"
          />
        </p>
      </div>

      <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Edit"
          @click="$emit('edit')"
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
    </div>
  </UCard>
</template>
