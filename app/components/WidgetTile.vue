<template>
  <div
    class="group relative h-full"
    :style="cardVars"
  >
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
    <SectionCard
      v-if="widget.kind === 'section'"
      :title="widget.content"
    />

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
    <div
      v-else-if="widget.kind === 'shortcut' && shortcut"
      :class="`${cardClass} h-full`"
    >
      <ShortcutCard
        :shortcut="shortcut"
        :ping="ping"
        :size="cardSize"
        :span="{ w: sizeW, h: sizeH }"
      />
    </div>

    <!-- flow -->
    <div
      v-else-if="widget.kind === 'flow' && flow"
      :class="`${cardClass} h-full`"
    >
      <FlowCard
        :flow="flow"
        :size="cardSize"
        :is-tall="isTall"
        :running="running"
        @run="runFlow"
      />
    </div>

    <!-- monitor (reuses the Monitoring page card, self-fetches its snapshot) -->
    <MonitorCard
      v-else-if="widget.kind === 'monitor' && monitor"
      :class="`${cardClass} h-full`"
      :monitor="monitor"
      :isBoard="true"
      :icon="metaFor(monitor.integrationId)?.icon"
      :img="metaFor(monitor.integrationId)?.img"
      :span="{ w: sizeW, h: sizeH }"
    />

    <!-- note (rich text) -->
    <UCard
      v-else-if="widget.kind === 'note'"
      class="h-full"
      :ui="{ root: cardClass, body: 'h-full' }"
    >
      <NoteCard
        :content="widget.content"
        :size="cardSize"
      />
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

<script setup lang="ts">
import type { PingState } from '~/composables/usePing'
import type { Flow, IntegrationMeta, Monitor, Shortcut, Widget } from '~/types'

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

// Size buckets derived from the tile's grid span (in cells). Bodies use these to
// decide how much detail to show — a small tile stays compact, a wide/tall tile
// can breathe. Thresholds are in cells: ~4 cells = one "tile unit", so a tile is
// tall/wide once it spans two units (8 cells) and large once its area matches a
// 2×2-unit tile (64 cells²).
const sizeW = computed(() => props.span?.w ?? props.widget.w)
const sizeH = computed(() => props.span?.h ?? props.widget.h)
const isTall = computed(() => sizeH.value >= 8)
const isLarge = computed(() => sizeW.value * sizeH.value >= 64)
// size bucket handed to ShortcutCard / FlowCard so they pick a widget layout
const cardSize = computed<'sm' | 'lg'>(() => (isLarge.value ? 'lg' : 'sm'))

// Per-tile card chrome + background fill, shared with the public board view.
const cardClass = computed(() => bentoCardClass(props.widget.cardStyle, props.widget.bg))
// CSS vars feeding the solid fill; set on the wrapper so the (possibly nested)
// .bento-card inherits them. Empty unless this tile has a solid background.
const cardVars = computed(() => bentoCardVars(props.widget))

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
</script>
