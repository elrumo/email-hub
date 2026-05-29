<script setup lang="ts">
import type { Flow, Monitor, Shortcut, Widget, WidgetKind } from '~/types'

// everything the tiles need to resolve their references, fetched once
const { data: widgets, refresh } = await useFetch<Widget[]>('/api/widgets', {
  key: 'widgets',
  default: () => []
})
const { data: shortcuts } = await useFetch<Shortcut[]>('/api/shortcuts', {
  key: 'shortcuts',
  default: () => []
})
const { data: flows } = await useFetch<Flow[]>('/api/flows', {
  key: 'flows',
  default: () => []
})
const { data: monitors } = await useFetch<Monitor[]>('/api/monitors', {
  key: 'monitors',
  default: () => []
})
const { data: catalog } = useCatalog()
const toast = useToast()

// only ping shortcuts that actually appear on the grid (and are ping-enabled)
const gridShortcuts = computed(() => {
  const ids = new Set(widgets.value.filter(w => w.kind === 'shortcut').map(w => w.refId))
  return shortcuts.value.filter(s => ids.has(s.id))
})
const { results: pings } = usePing(gridShortcuts)

const editMode = ref(false)

// ── add-widget modal ────────────────────────────────────────────────────────
const addOpen = ref(false)
const adding = ref(false)
const draft = reactive<{ kind: WidgetKind, refId: string, content: string, w: number, h: number }>({
  kind: 'shortcut',
  refId: '',
  content: '',
  w: 1,
  h: 1
})

const KIND_OPTIONS = [
  { label: 'Shortcut', value: 'shortcut', icon: 'i-lucide-link' },
  { label: 'Flow', value: 'flow', icon: 'i-lucide-workflow' },
  { label: 'Monitor', value: 'monitor', icon: 'i-lucide-activity' },
  { label: 'Note', value: 'note', icon: 'i-lucide-sticky-note' }
] as const

// options for the reference picker, by kind
const refItems = computed(() => {
  if (draft.kind === 'shortcut') return shortcuts.value.map(s => ({ label: s.name, value: s.id }))
  if (draft.kind === 'flow') return flows.value.map(f => ({ label: f.name, value: f.id }))
  if (draft.kind === 'monitor') return monitors.value.map(m => ({ label: m.name, value: m.id }))
  return []
})
const refEmptyHint = computed(() => {
  if (draft.kind === 'shortcut') return { msg: 'No shortcuts yet.', to: '/shortcuts', label: 'Add a shortcut' }
  if (draft.kind === 'flow') return { msg: 'No flows yet.', to: '/flows', label: 'Build a flow' }
  if (draft.kind === 'monitor') return { msg: 'No monitors yet.', to: '/monitoring', label: 'Add a monitor' }
  return null
})

watch(() => draft.kind, () => {
  draft.refId = ''
  // notes read better wider; monitors a touch taller
  draft.w = draft.kind === 'note' ? 2 : 1
  draft.h = draft.kind === 'monitor' ? 2 : 1
})

function openAdd() {
  Object.assign(draft, { kind: 'shortcut', refId: '', content: '', w: 1, h: 1 })
  addOpen.value = true
}

async function addWidget() {
  if (draft.kind !== 'note' && !draft.refId) {
    toast.add({ title: 'Pick something to add', color: 'warning' })
    return
  }
  adding.value = true
  try {
    await $fetch('/api/widgets', {
      method: 'POST',
      body: {
        kind: draft.kind,
        refId: draft.kind === 'note' ? null : draft.refId,
        content: draft.kind === 'note' ? draft.content : null,
        w: draft.w,
        h: draft.h,
        sortOrder: widgets.value.length
      }
    })
    addOpen.value = false
    await refresh()
    toast.add({ title: 'Added to home', color: 'success' })
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not add tile'
    toast.add({ title: msg, color: 'error' })
  } finally {
    adding.value = false
  }
}

async function removeWidget(w: Widget) {
  await $fetch(`/api/widgets/${w.id}`, { method: 'DELETE' })
  await refresh()
}

// ── drag-to-reorder (HTML5 DnD, edit mode only) ──────────────────────────────
const dragId = ref<string | null>(null)

function onDragStart(id: string) {
  if (!editMode.value || resizing.value) return
  dragId.value = id
}
async function onDrop(targetId: string) {
  if (!dragId.value || dragId.value === targetId) return
  const order = widgets.value.map(w => w.id)
  const from = order.indexOf(dragId.value)
  const to = order.indexOf(targetId)
  if (from === -1 || to === -1) return
  order.splice(to, 0, order.splice(from, 1)[0]!)
  dragId.value = null
  // optimistic local reorder, then persist
  widgets.value = order.map(id => widgets.value.find(w => w.id === id)!).filter(Boolean)
  await $fetch('/api/widgets/reorder', { method: 'POST', body: { ids: order } })
}

// ── resize (pointer-drag a corner handle, snaps to grid cells) ───────────────
const MAX_SPAN = 4
// TransitionGroup ref resolves to a component proxy; unwrap to its root <div>.
const gridRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const gridEl = computed<HTMLElement | null>(() => {
  const r = gridRef.value
  if (!r) return null
  return (r as { $el?: HTMLElement }).$el ?? (r as HTMLElement)
})
// number of columns currently rendered (responsive: 2 / 3 / 4)
const cols = ref(4)
function measureCols() {
  if (!gridEl.value) return
  const styles = getComputedStyle(gridEl.value)
  const n = styles.gridTemplateColumns.split(' ').filter(Boolean).length
  if (n) cols.value = n
}
onMounted(() => {
  measureCols()
  window.addEventListener('resize', measureCols)
})
onBeforeUnmount(() => window.removeEventListener('resize', measureCols))
// re-measure when tiles first appear
watch(() => widgets.value.length, () => nextTick(measureCols))

const resizing = ref(false)
// the widget being resized + its live (un-persisted) preview span
const resizeId = ref<string | null>(null)
const previewSpan = reactive({ w: 1, h: 1 })

interface ResizeCtx {
  widget: Widget
  startX: number
  startY: number
  cellW: number
  cellH: number
  gap: number
  startW: number
  startH: number
}
let ctx: ResizeCtx | null = null

function onResizeStart(e: PointerEvent, w: Widget) {
  if (!editMode.value || !gridEl.value) return
  e.preventDefault()
  e.stopPropagation()
  const rect = gridEl.value.getBoundingClientRect()
  const styles = getComputedStyle(gridEl.value)
  const gap = Number.parseFloat(styles.columnGap) || 0
  const rowH = Number.parseFloat(styles.gridAutoRows) || 128
  const n = styles.gridTemplateColumns.split(' ').filter(Boolean).length || cols.value
  const cellW = (rect.width - gap * (n - 1)) / n
  ctx = {
    widget: w,
    startX: e.clientX,
    startY: e.clientY,
    cellW,
    cellH: rowH,
    gap,
    startW: w.w,
    startH: w.h
  }
  resizing.value = true
  resizeId.value = w.id
  previewSpan.w = w.w
  previewSpan.h = w.h
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd, { once: true })
}

function onResizeMove(e: PointerEvent) {
  if (!ctx) return
  const maxW = Math.min(MAX_SPAN, cols.value)
  const dx = e.clientX - ctx.startX
  const dy = e.clientY - ctx.startY
  const dCols = Math.round(dx / (ctx.cellW + ctx.gap))
  const dRows = Math.round(dy / (ctx.cellH + ctx.gap))
  previewSpan.w = Math.min(maxW, Math.max(1, ctx.startW + dCols))
  previewSpan.h = Math.min(MAX_SPAN, Math.max(1, ctx.startH + dRows))
}

async function onResizeEnd() {
  window.removeEventListener('pointermove', onResizeMove)
  const c = ctx
  ctx = null
  resizing.value = false
  const id = resizeId.value
  resizeId.value = null
  if (!c || !id) return
  const w = previewSpan.w
  const h = previewSpan.h
  if (w === c.startW && h === c.startH) return
  // optimistic update, then persist via the existing PUT endpoint
  const target = widgets.value.find(x => x.id === id)
  if (target) {
    target.w = w
    target.h = h
  }
  try {
    await $fetch(`/api/widgets/${id}`, { method: 'PUT', body: { w, h } })
  } catch {
    await refresh()
  }
}

// effective span for a tile: live preview while resizing, persisted span otherwise
function spanFor(w: Widget) {
  if (resizeId.value === w.id) return { w: previewSpan.w, h: previewSpan.h }
  return { w: w.w, h: w.h }
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          Home
        </h1>
        <p class="mt-1 text-sm text-muted">
          Your dashboard. Pin the shortcuts, flows and monitors you care about into a grid.
        </p>
      </div>
      <div class="flex items-center gap-2 self-start">
        <UButton
          :icon="editMode ? 'i-lucide-check' : 'i-lucide-layout-grid'"
          :label="editMode ? 'Done' : 'Arrange'"
          color="neutral"
          variant="soft"
          @click="editMode = !editMode"
        />
        <UButton
          icon="i-lucide-plus"
          label="Add tile"
          @click="openAdd"
        />
      </div>
    </div>

    <div
      v-if="widgets.length === 0"
      class="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-default py-20 text-center"
    >
      <span class="flex size-12 items-center justify-center rounded-2xl bg-elevated text-dimmed">
        <UIcon
          name="i-lucide-layout-grid"
          class="size-6"
        />
      </span>
      <div class="space-y-1">
        <p class="font-medium text-highlighted">
          Your home is empty
        </p>
        <p class="text-sm text-muted">
          Add tiles for the shortcuts, flows and monitors you want at a glance.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Add tile"
        @click="openAdd"
      />
    </div>

    <TransitionGroup
      v-else
      ref="gridRef"
      tag="div"
      name="tile"
      class="grid auto-rows-[8rem] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      :class="{ 'is-editing': editMode }"
    >
      <div
        v-for="w in widgets"
        :key="w.id"
        :draggable="editMode && !resizing"
        class="tile-cell"
        :class="{ 'is-dragging': dragId === w.id, 'is-resizing': resizeId === w.id }"
        :style="{ gridColumn: `span ${spanFor(w).w}`, gridRow: `span ${spanFor(w).h}` }"
        @dragstart="onDragStart(w.id)"
        @dragover.prevent
        @drop="onDrop(w.id)"
      >
        <WidgetTile
          :widget="w"
          :span="spanFor(w)"
          :shortcuts="shortcuts"
          :flows="flows"
          :monitors="monitors"
          :catalog="catalog"
          :ping="pings[w.refId ?? '']"
          :edit-mode="editMode"
          :class="{ 'cursor-grab ring-2 ring-primary/40 rounded-[var(--ui-radius)]': editMode }"
          @remove="removeWidget(w)"
        />

        <!-- resize handle (edit mode): drag to grow/shrink across grid cells -->
        <button
          v-if="editMode"
          type="button"
          class="resize-handle"
          aria-label="Resize tile"
          @pointerdown="onResizeStart($event, w)"
          @dragstart.prevent
          @click.stop
        >
          <UIcon
            name="i-lucide-move-diagonal-2"
            class="size-3"
          />
        </button>

        <!-- live size badge while resizing -->
        <span
          v-if="resizeId === w.id"
          class="size-badge"
        >{{ previewSpan.w }}×{{ previewSpan.h }}</span>
      </div>
    </TransitionGroup>

    <!-- add-tile modal -->
    <UModal
      v-model:open="addOpen"
      title="Add a tile"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Type">
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="opt in KIND_OPTIONS"
                :key="opt.value"
                type="button"
                class="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors"
                :class="draft.kind === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-default text-muted hover:bg-elevated'"
                @click="draft.kind = opt.value"
              >
                <UIcon
                  :name="opt.icon"
                  class="size-5"
                />
                {{ opt.label }}
              </button>
            </div>
          </UFormField>

          <template v-if="draft.kind !== 'note'">
            <UFormField
              v-if="refItems.length"
              :label="draft.kind === 'shortcut' ? 'Shortcut' : draft.kind === 'flow' ? 'Flow' : 'Monitor'"
              required
            >
              <USelect
                v-model="draft.refId"
                :items="refItems"
                placeholder="Choose one"
                class="w-full"
              />
            </UFormField>
            <UAlert
              v-else-if="refEmptyHint"
              color="neutral"
              variant="soft"
              icon="i-lucide-info"
              :title="refEmptyHint.msg"
            >
              <template #actions>
                <UButton
                  :to="refEmptyHint.to"
                  :label="refEmptyHint.label"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  @click="addOpen = false"
                />
              </template>
            </UAlert>
          </template>

          <UFormField
            v-else
            label="Note"
          >
            <UTextarea
              v-model="draft.content"
              :rows="4"
              placeholder="Anything you want to remember…"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Width"
              description="Columns (1–4)"
            >
              <UInputNumber
                v-model="draft.w"
                :min="1"
                :max="4"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Height"
              description="Rows (1–4)"
            >
              <UInputNumber
                v-model="draft.h"
                :min="1"
                :max="4"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="close"
          />
          <UButton
            label="Add"
            :loading="adding"
            :disabled="draft.kind !== 'note' && !refItems.length"
            @click="addWidget"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

<style scoped>
/* Each cell smoothly settles into its new column/row span when resized,
   reordered, or when edit mode shifts the layout. */
.tile-cell {
  position: relative;
  height: 100%;
  transition:
    grid-column 0.25s ease,
    grid-row 0.25s ease,
    transform 0.25s ease,
    opacity 0.25s ease;
}

/* gentle "ready to edit" lift on every tile when arranging */
.is-editing .tile-cell {
  animation: tile-wiggle-in 0.3s ease both;
}
@keyframes tile-wiggle-in {
  from {
    transform: scale(0.97);
    opacity: 0.6;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.tile-cell.is-dragging {
  opacity: 0.4;
  transform: scale(0.96);
}
.tile-cell.is-resizing {
  z-index: 20;
}
.tile-cell.is-resizing :deep(.group) {
  outline: 2px dashed var(--ui-primary);
  outline-offset: 2px;
  border-radius: var(--ui-radius);
}

/* TransitionGroup: add / remove / move animations for tiles */
.tile-enter-from,
.tile-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.tile-leave-active {
  position: absolute;
}
.tile-move {
  transition: transform 0.3s ease;
}

/* corner resize handle, visible in edit mode */
.resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  cursor: nwse-resize;
  color: var(--ui-text-dimmed);
  background: color-mix(in oklab, var(--ui-bg) 80%, transparent);
  backdrop-filter: blur(4px);
  border-radius: 0.375rem;
  opacity: 0;
  transform: scale(0.8);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    color 0.2s ease;
  touch-action: none;
}
.tile-cell:hover .resize-handle,
.tile-cell.is-resizing .resize-handle {
  opacity: 1;
  transform: scale(1);
}
.resize-handle:hover {
  color: var(--ui-primary);
}

/* live W×H readout shown while dragging the handle */
.size-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 16;
  transform: translate(-50%, -50%);
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ui-bg);
  background: var(--ui-primary);
  border-radius: 9999px;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .tile-cell,
  .tile-move,
  .resize-handle {
    transition: none;
  }
  .is-editing .tile-cell {
    animation: none;
  }
}
</style>
