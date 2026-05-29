<script setup lang="ts">
import type { PingState } from '~/composables/usePing'
import type { Flow, IntegrationMeta, Monitor, Shortcut, Widget } from '~/types'
import { relTime } from '~/composables/format'

/**
 * One tile on the home bento grid. Resolves its referenced entity from the
 * lists the page already fetched and renders the right body per kind. A tile
 * whose reference has been deleted renders a "missing" state so it can be
 * cleaned up (the home page also skips dangling widgets server-side on delete).
 *
 * Card chrome (shadow / outline / none) is per-tile via `widget.cardStyle`;
 * "section" tiles render as a chrome-less heading band, "note" tiles render
 * rich text authored with the Nuxt UI editor.
 */
const props = defineProps<{
  widget: Widget
  shortcuts: Shortcut[]
  flows: Flow[]
  monitors: Monitor[]
  catalog: IntegrationMeta[]
  /** live ping state for a shortcut widget */
  ping?: PingState
  /** drag-reorder affordance is shown only in edit mode */
  editMode?: boolean
  /** effective grid span (col/row count) so the body can adapt to its size */
  span?: { w: number, h: number }
}>()

// Size buckets derived from the tile's grid span. Bodies use these to decide
// how much detail to show — e.g. a 1×1 tile stays compact, a wide/tall tile
// can breathe. `area` is a coarse small/medium/large signal.
const sizeW = computed(() => props.span?.w ?? props.widget.w)
const sizeH = computed(() => props.span?.h ?? props.widget.h)
const isTall = computed(() => sizeH.value >= 2)
const isLarge = computed(() => sizeW.value * sizeH.value >= 4)

// Per-tile card chrome, shared with the public board view.
const cardClass = computed(() => bentoCardClass(props.widget.cardStyle))
const noteIsHtml = computed(() => isRichTextHtml(props.widget.content))

const emit = defineEmits<{ remove: [], edit: [] }>()

const shortcut = computed(() => props.shortcuts.find(s => s.id === props.widget.refId))
const flow = computed(() => props.flows.find(f => f.id === props.widget.refId))
const monitor = computed(() => props.monitors.find(m => m.id === props.widget.refId))
const metaFor = (id?: string) => props.catalog.find(i => i.id === id)

const missing = computed(() => {
  if (props.widget.kind === 'shortcut') return !shortcut.value
  if (props.widget.kind === 'flow') return !flow.value
  if (props.widget.kind === 'monitor') return !monitor.value
  return false
})

const running = ref(false)
async function runFlow() {
  if (!flow.value) return
  running.value = true
  try {
    await $fetch(`/api/flows/${flow.value.id}/run`, { method: 'POST', body: {} })
  } finally {
    running.value = false
  }
}

const host = computed(() => {
  if (!shortcut.value) return ''
  try {
    return new URL(shortcut.value.url).host
  } catch {
    return shortcut.value.url
  }
})
</script>

<template>
  <div class="group relative h-full">
    <!-- edit-mode controls: drag handle + edit + remove. The tile itself has
         pointer-events disabled while editing (so it drags as one piece);
         these controls opt back in. -->
    <div
      v-if="editMode"
      class="pointer-events-auto absolute right-2 top-2 z-10 flex items-center gap-1"
    >
      <span
        class="drag-handle flex size-6 cursor-grab items-center justify-center rounded-md bg-default/80 text-dimmed backdrop-blur"
        aria-label="Drag to reorder"
      >
        <UIcon
          name="i-lucide-grip-vertical"
          class="size-3.5"
        />
      </span>
      <UButton
        icon="i-lucide-pencil"
        color="neutral"
        variant="soft"
        size="xs"
        aria-label="Edit tile"
        @pointerdown.stop
        @click="emit('edit')"
      />
      <UButton
        icon="i-lucide-x"
        color="error"
        variant="soft"
        size="xs"
        aria-label="Remove tile"
        @pointerdown.stop
        @click="emit('remove')"
      />
    </div>

    <!-- section: a chrome-less, full-width heading band between tile groups -->
    <div
      v-if="widget.kind === 'section'"
      class="flex h-full items-center gap-3"
    >
      <h2 class="shrink-0 text-base font-semibold tracking-tight text-highlighted">
        {{ widget.content || 'Section' }}
      </h2>
      <span class="h-px flex-1 bg-default" />
    </div>

    <!-- missing reference -->
    <UCard
      v-else-if="missing"
      class="h-full"
      :ui="{ root: cardClass, body: 'flex h-full flex-col items-center justify-center gap-2 text-center' }"
    >
      <UIcon
        name="i-lucide-unlink"
        class="size-5 text-dimmed"
      />
      <p class="text-sm text-muted">
        This {{ widget.kind }} was deleted.
      </p>
      <UButton
        label="Remove tile"
        color="neutral"
        variant="soft"
        size="xs"
        @click="emit('remove')"
      />
    </UCard>

    <!-- shortcut -->
    <UCard
      v-else-if="widget.kind === 'shortcut' && shortcut"
      class="h-full"
      :ui="{ root: cardClass, body: 'flex h-full flex-col gap-2' }"
    >
      <a
        :href="shortcut.url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-highlighted hover:text-primary"
        :class="isLarge ? 'flex flex-col gap-3' : 'flex items-center gap-2.5'"
      >
        <span
          class="flex shrink-0 items-center justify-center rounded-2xl bg-elevated text-muted"
          :class="isLarge ? 'size-12' : 'size-9'"
        >
          <img
            v-if="isImageIcon(shortcut.icon)"
            :src="shortcut.icon"
            alt=""
            class="rounded"
            :class="isLarge ? 'size-7' : 'size-5'"
          >
          <UIcon
            v-else
            :name="shortcut.icon || 'i-lucide-link'"
            :class="isLarge ? 'size-7' : 'size-5'"
          />
        </span>
        <span class="min-w-0">
          <span class="flex items-center gap-1 font-medium">
            <span class="truncate">{{ shortcut.name }}</span>
            <UIcon
              name="i-lucide-arrow-up-right"
              class="size-3.5 shrink-0 text-dimmed transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </span>
          <span class="block truncate text-sm text-dimmed">{{ host }}</span>
        </span>
      </a>
      <PingDot
        v-if="shortcut.pingEnabled"
        :state="ping"
        class="mt-auto"
      />
    </UCard>

    <!-- flow -->
    <UCard
      v-else-if="widget.kind === 'flow' && flow"
      class="h-full"
      :ui="{ root: cardClass, body: 'flex h-full flex-col gap-2' }"
    >
      <div class="flex items-start justify-between gap-2">
        <NuxtLink
          :to="`/flows/${flow.id}`"
          class="flex items-center gap-2 font-medium text-highlighted hover:text-primary"
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted">
            <UIcon
              name="i-lucide-workflow"
              class="size-4"
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
        class="text-sm text-muted"
        :class="isLarge ? 'line-clamp-3' : 'line-clamp-2'"
      >
        {{ flow.description }}
      </p>
      <p class="text-sm text-dimmed">
        last run {{ relTime(flow.lastRunAt) }}
      </p>
      <UButton
        icon="i-lucide-play"
        label="Run now"
        color="neutral"
        variant="soft"
        size="sm"
        class="mt-auto self-start"
        :loading="running"
        @click="runFlow"
      />
    </UCard>

    <!-- monitor (reuses the Monitoring page card, self-fetches its snapshot) -->
    <MonitorCard
      v-else-if="widget.kind === 'monitor' && monitor"
      :class="`${cardClass} h-full`"
      :monitor="monitor"
      :icon="metaFor(monitor.integrationId)?.icon"
      :img="metaFor(monitor.integrationId)?.img"
    />

    <!-- note (rich text) -->
    <UCard
      v-else-if="widget.kind === 'note'"
      class="h-full"
      :ui="{ root: cardClass, body: 'h-full' }"
    >
      <!-- eslint-disable vue/no-v-html -- author-owned content from the Nuxt UI editor -->
      <div
        v-if="noteIsHtml"
        class="bento-richtext h-full overflow-auto"
        :class="isLarge ? 'text-base' : 'text-sm'"
        v-html="widget.content"
      />
      <!-- eslint-enable vue/no-v-html -->
      <p
        v-else
        class="h-full overflow-auto whitespace-pre-wrap text-muted"
        :class="isLarge ? 'text-base' : 'text-sm'"
      >
        {{ widget.content || 'Empty note' }}
      </p>
    </UCard>

    <!-- image (content is the image URL; fills the tile, edge to edge) -->
    <div
      v-else-if="widget.kind === 'image'"
      :class="`${cardClass} h-full overflow-hidden bg-elevated`"
    >
      <img
        v-if="widget.content"
        :src="widget.content"
        alt=""
        class="size-full object-cover"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <div
        v-else
        class="flex h-full items-center justify-center text-dimmed"
      >
        <UIcon
          name="i-lucide-image"
          class="size-6"
        />
      </div>
    </div>

    <!-- iframe (content is the embed URL; owner-authored, like notes) -->
    <div
      v-else-if="widget.kind === 'iframe'"
      :class="`${cardClass} h-full overflow-hidden bg-default`"
    >
      <iframe
        v-if="widget.content"
        :src="widget.content"
        title="Embedded content"
        class="size-full border-0"
        loading="lazy"
        referrerpolicy="no-referrer"
        allow="fullscreen; clipboard-write"
      />
      <div
        v-else
        class="flex h-full items-center justify-center text-dimmed"
      >
        <UIcon
          name="i-lucide-app-window"
          class="size-6"
        />
      </div>
    </div>
  </div>
</template>
