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
 *
 * On a board tile the body also adapts to the tile's grid `span`: a 1×1 tile
 * shows the icon only, a 2×2 shows a centred name (no url), and anything larger
 * shows the full icon + name + host. See `tier`.
 */
const { shortcut, ping, size = 'list', span } = defineProps<{
  shortcut: Shortcut
  /** live ping state, when the parent is polling */
  ping?: PingState
  /** 'list' = Shortcuts-page row; 'sm'/'lg' = bento widget body */
  size?: 'list' | 'sm' | 'lg'
  /** widget grid span in cells; drives how much detail a board tile shows */
  span?: { w: number, h: number }
}>()

defineEmits<{ edit: [], delete: [] }>()

const isWidget = computed(() => size !== 'list')

// Discrete detail tier for a board tile, derived from its grid span. One tile
// "unit" is 4 cells (the smallest shortcut tile is 4×4), so:
//   1×1 unit  → 'icon' : icon only, stacked, no name/url
//   2×2 units → 'name' : icon + centred name, still no url
//   larger    → 'full' : icon + name + host (the original widget layout)
// Falls back to 'full' when no span is given (e.g. legacy callers).
const tier = computed<'icon' | 'name' | 'full'>(() => {
  if (!span) return 'full'
  const units = Math.min(span.w, span.h) / 4
  if (units < 2) return 'icon'
  if (units < 3) return 'name'
  return 'full'
})

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
       icon / text / gaps scale with the tile's actual rendered width. How much
       detail shows is driven by `tier` (from the grid span):
         icon → just the icon, stacked & centred (1×1 tile)
         name → icon + centred name, no host (2×2 tile)
         full → icon + name + host, left-aligned & growing (larger tiles) -->
  <div
    v-if="isWidget"
    class="@container group flex h-full flex-col gap-2"
  >
    <a
      :href="shortcut.url"
      target="_blank"
      rel="noopener noreferrer"
      class="flex h-full text-highlighted hover:text-primary"
      :class="tier === 'full'
        ? 'items-center gap-2.5 @sm:h-auto @sm:flex-col @sm:items-start @sm:gap-3'
        : 'flex-col items-center justify-center gap-2 text-center'"
    >
      <span
        class="flex shrink-0 items-center justify-center rounded-2xl bg-elevated text-muted"
        :class="tier === 'full' ? 'size-9 @sm:size-11 @md:size-12' : 'size-11 @md:size-12'"
      >
        <img
          v-if="isImageIcon(shortcut.icon)"
          :src="shortcut.icon"
          alt=""
          class="rounded"
          :class="tier === 'full' ? 'size-5 @sm:size-6 @md:size-7' : 'size-6 @md:size-7'"
        >
        <UIcon
          v-else
          :name="shortcut.icon || 'i-lucide-link'"
          :class="tier === 'full' ? 'size-5 @sm:size-6 @md:size-7' : 'size-6 @md:size-7'"
        />
      </span>
      <span
        v-if="tier !== 'icon'"
        class="min-w-0 max-w-full"
      >
        <span
          class="flex items-center gap-1 font-medium @md:text-lg"
          :class="{ 'justify-center': tier === 'name' }"
        >
          <span class="truncate">{{ shortcut.name }}</span>
          <UIcon
            name="i-lucide-arrow-up-right"
            class="size-3.5 shrink-0 text-dimmed transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary @md:size-4"
          />
        </span>
        <span
          v-if="tier === 'full'"
          class="block truncate text-sm text-dimmed @md:text-base"
        >{{ host }}</span>
      </span>
    </a>

    <PingDot
      v-if="shortcut.pingEnabled"
      :state="ping"
      class="mt-auto"
      :class="{ 'self-center': tier !== 'full' }"
    />
  </div>

  <!-- list row on the Shortcuts page -->
  <UCard
    v-else
    variant="xs"
    :ui="{ body: 'flex items-center gap-3' }"
  >
    <div class="group relative flex w-full items-center gap-3">
      <div class="flex w-full items-center gap-3 group-hover:pr-6 transition-all">
        <a
          :href="shortcut.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex size-8 shrink-0 items-center justify-center rounded-md bg-elevated text-muted transition-colors hover:text-primary"
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

        <div class="min-w-0 flex-1 flex flex-col gap-0.5 shortcut-body">
          <a
            :href="shortcut.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1.5 truncate font-medium text-highlighted hover:text-primary text-sm"
          >
            <span class="truncate">{{ shortcut.name }}</span>
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5 shrink-0 text-dimmed"
            />
          </a>

          <p class="flex items-center gap-2">
            <span class="truncate text-dimmed text-xs">{{ host }}</span>
            <PingDot
              v-if="shortcut.pingEnabled"
              :state="ping"
            />
          </p>
        </div>
      </div>

      <div class="absolute top-1/2 -translate-y-1/2 -right-5 flex flex-col items-center gap-1 opacity-0 transition-all group-hover:opacity-100 group-hover:-translate-x-3">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Edit"
          class="rounded-sm"
          @click="$emit('edit')"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="Delete"
          class="rounded-sm"
          @click="$emit('delete')"
        />
      </div>
    </div>
  </UCard>
</template>
