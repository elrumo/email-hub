<script setup lang="ts">
import type { Board, Flow, Monitor, Shortcut, Widget, WidgetKind } from '~/types'

// ── boards (multiple home grids) ──────────────────────────────────────────────
const { data: boards, refresh: refreshBoards } = await useFetch<Board[]>('/api/boards', {
  key: 'boards',
  default: () => []
})
// the selected board: starts on the default (or the first board)
const activeBoardId = ref<string>('')
const activeBoard = computed(() => boards.value.find(b => b.id === activeBoardId.value) ?? null)
function pickInitialBoard() {
  if (activeBoardId.value && boards.value.some(b => b.id === activeBoardId.value)) return
  const def = boards.value.find(b => b.isDefault) ?? boards.value[0]
  activeBoardId.value = def?.id ?? ''
}
pickInitialBoard()
watch(boards, pickInitialBoard)

// everything the tiles need to resolve their references. Widgets are scoped to
// the selected board and re-fetched when it changes.
const { data: widgets, refresh } = await useFetch<Widget[]>('/api/widgets', {
  key: 'widgets',
  query: { boardId: activeBoardId },
  watch: [activeBoardId],
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
        boardId: activeBoardId.value,
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

// ── board management ──────────────────────────────────────────────────────────
const boardModalOpen = ref(false)
const boardBusy = ref(false)
// draft for create/edit; `id` empty means "create new"
const boardDraft = reactive({ id: '', name: '', isDefault: false, isPublic: false, publicTrigger: false })

function openNewBoard() {
  Object.assign(boardDraft, { id: '', name: '', isDefault: false, isPublic: false, publicTrigger: false })
  boardModalOpen.value = true
}
function openEditBoard() {
  const b = activeBoard.value
  if (!b) return
  Object.assign(boardDraft, {
    id: b.id,
    name: b.name,
    isDefault: b.isDefault,
    isPublic: b.isPublic,
    publicTrigger: b.publicTrigger
  })
  boardModalOpen.value = true
}

async function saveBoard() {
  if (!boardDraft.name.trim()) {
    toast.add({ title: 'Give the board a name', color: 'warning' })
    return
  }
  boardBusy.value = true
  try {
    if (boardDraft.id) {
      await $fetch(`/api/boards/${boardDraft.id}`, {
        method: 'PUT',
        body: {
          name: boardDraft.name,
          isDefault: boardDraft.isDefault,
          isPublic: boardDraft.isPublic,
          publicTrigger: boardDraft.publicTrigger
        }
      })
    } else {
      const res = await $fetch<{ id: string }>('/api/boards', {
        method: 'POST',
        body: {
          name: boardDraft.name,
          isPublic: boardDraft.isPublic,
          publicTrigger: boardDraft.publicTrigger
        }
      })
      activeBoardId.value = res.id
    }
    boardModalOpen.value = false
    await refreshBoards()
    toast.add({ title: 'Board saved', color: 'success' })
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not save board'
    toast.add({ title: msg, color: 'error' })
  } finally {
    boardBusy.value = false
  }
}

async function deleteActiveBoard() {
  const b = activeBoard.value
  if (!b) return
  if (!confirm(`Delete the board “${b.name}” and all its tiles?`)) return
  try {
    await $fetch(`/api/boards/${b.id}`, { method: 'DELETE' })
    activeBoardId.value = ''
    boardModalOpen.value = false
    await refreshBoards()
    toast.add({ title: 'Board deleted', color: 'success' })
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not delete board'
    toast.add({ title: msg, color: 'error' })
  }
}

const publicUrl = computed(() =>
  activeBoard.value?.isPublic && import.meta.client ? `${location.origin}/b/${activeBoard.value.slug}` : ''
)
async function copyPublicUrl() {
  if (!publicUrl.value) return
  try {
    await navigator.clipboard.writeText(publicUrl.value)
    toast.add({ title: 'Public link copied', color: 'success' })
  } catch {
    toast.add({ title: publicUrl.value, color: 'neutral' })
  }
}

// ── drag-to-reorder (pointer-drag, free move + grid snap, edit mode only) ─────
// The dragged tile follows the cursor (free movement). As its centre crosses
// another tile's centre, the list reorders live so the rest flow to fill the
// gap (animated by the TransitionGroup). On release the tile snaps into its
// slot and the new order is persisted.
const dragId = ref<string | null>(null)
// true during the brief drop animation (offset eases back to its slot)
const settling = ref(false)
// live pixel offset applied to the lifted tile so it tracks the pointer
const dragOffset = reactive({ x: 0, y: 0 })

interface DragCtx {
  id: string
  startX: number
  startY: number
  pointerId: number
}
let drag: DragCtx | null = null

function tileEls(): HTMLElement[] {
  if (!gridEl.value) return []
  return Array.from(gridEl.value.querySelectorAll<HTMLElement>('[data-tile-id]'))
}

function onDragStart(e: PointerEvent, id: string) {
  if (!editMode.value || resizing.value) return
  e.preventDefault()
  drag = { id, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId }
  dragId.value = id
  dragOffset.x = 0
  dragOffset.y = 0
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd, { once: true })
}

function onDragMove(e: PointerEvent) {
  if (!drag) return
  dragOffset.x = e.clientX - drag.startX
  dragOffset.y = e.clientY - drag.startY

  // find the tile whose centre is nearest the pointer (excluding the dragged one)
  let nearestId: string | null = null
  let nearestDist = Infinity
  for (const el of tileEls()) {
    const tid = el.dataset.tileId
    if (!tid || tid === drag.id) continue
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    // require the pointer to be inside this tile's bounds before swapping,
    // so reordering feels deliberate rather than twitchy
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue
    const d = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2
    if (d < nearestDist) {
      nearestDist = d
      nearestId = tid
    }
  }
  if (!nearestId) return

  const order = widgets.value
  const from = order.findIndex(w => w.id === drag!.id)
  const to = order.findIndex(w => w.id === nearestId)
  if (from === -1 || to === -1 || from === to) return

  // capture the dragged tile's screen position before the splice so we can
  // re-anchor the offset and keep it visually glued to the pointer
  const before = tileEls().find(el => el.dataset.tileId === drag!.id)?.getBoundingClientRect()
  const reordered = [...order]
  reordered.splice(to, 0, reordered.splice(from, 1)[0]!)
  widgets.value = reordered
  nextTick(() => {
    const after = tileEls().find(el => el.dataset.tileId === drag?.id)?.getBoundingClientRect()
    if (before && after && drag) {
      // the tile's slot moved by (after-before); compensate so it doesn't jump
      drag.startX += after.left - before.left
      drag.startY += after.top - before.top
      dragOffset.x = e.clientX - drag.startX
      dragOffset.y = e.clientY - drag.startY
    }
  })
}

async function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove)
  const d = drag
  drag = null
  if (!d) {
    dragId.value = null
    dragOffset.x = 0
    dragOffset.y = 0
    return
  }
  // settle: enable transitions, then on the next frame zero the offset so the
  // tile glides from where it was released into its grid slot.
  const settlingId = d.id
  settling.value = true
  requestAnimationFrame(() => {
    dragOffset.x = 0
    dragOffset.y = 0
    window.setTimeout(() => {
      // bail if a fresh drag started in the meantime
      if (drag) return
      settling.value = false
      if (dragId.value === settlingId) dragId.value = null
    }, 280)
  })
  const order = widgets.value.map(w => w.id)
  await $fetch('/api/widgets/reorder', { method: 'POST', body: { ids: order, boardId: activeBoardId.value } })
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

function resizingEl(): HTMLElement | null {
  if (!gridEl.value || !resizeId.value) return null
  return gridEl.value.querySelector<HTMLElement>(`[data-tile-id="${resizeId.value}"]`)
}

function onResizeMove(e: PointerEvent) {
  if (!ctx) return
  const maxW = Math.min(MAX_SPAN, cols.value)
  const dx = e.clientX - ctx.startX
  const dy = e.clientY - ctx.startY
  const dCols = Math.round(dx / (ctx.cellW + ctx.gap))
  const dRows = Math.round(dy / (ctx.cellH + ctx.gap))
  const nextW = Math.min(maxW, Math.max(1, ctx.startW + dCols))
  const nextH = Math.min(MAX_SPAN, Math.max(1, ctx.startH + dRows))
  if (nextW === previewSpan.w && nextH === previewSpan.h) return

  // FLIP: a grid-span change is instant and un-animatable, so record the box
  // before the change, apply it, then animate the card from old→new size.
  const el = resizingEl()
  const card = el?.firstElementChild as HTMLElement | undefined
  const before = card?.getBoundingClientRect()
  previewSpan.w = nextW
  previewSpan.h = nextH
  if (!card || !before) return
  nextTick(() => {
    const after = card.getBoundingClientRect()
    const sx = before.width / after.width
    const sy = before.height / after.height
    card.style.transformOrigin = 'top left'
    card.style.transition = 'none'
    card.style.transform = `scale(${sx}, ${sy})`
    // next frame, release to the natural size so it eases into place
    requestAnimationFrame(() => {
      card.style.transition = 'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)'
      card.style.transform = ''
    })
  })
}

async function onResizeEnd() {
  window.removeEventListener('pointermove', onResizeMove)
  // drop any lingering FLIP transform/transition on the card
  const card = resizingEl()?.firstElementChild as HTMLElement | undefined
  if (card) {
    card.style.transition = ''
    card.style.transform = ''
    card.style.transformOrigin = ''
  }
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
      <div class="min-w-0">
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

    <!-- board switcher -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        v-for="b in boards"
        :key="b.id"
        :color="b.id === activeBoardId ? 'primary' : 'neutral'"
        :variant="b.id === activeBoardId ? 'solid' : 'soft'"
        size="sm"
        @click="activeBoardId = b.id"
      >
        <UIcon
          v-if="b.isDefault"
          name="i-lucide-star"
          class="size-3.5"
        />
        {{ b.name }}
        <UIcon
          v-if="b.isPublic"
          name="i-lucide-globe"
          class="size-3.5 opacity-70"
        />
      </UButton>
      <UButton
        icon="i-lucide-plus"
        label="New board"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="openNewBoard"
      />
      <div
        v-if="activeBoard"
        class="ml-auto flex items-center gap-2"
      >
        <UButton
          v-if="activeBoard.isPublic"
          icon="i-lucide-link"
          label="Copy public link"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="copyPublicUrl"
        />
        <UButton
          icon="i-lucide-settings-2"
          label="Board settings"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="openEditBoard"
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
      class="grid auto-rows-[8.5rem] grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      :class="{ 'is-editing': editMode }"
    >
      <div
        v-for="w in widgets"
        :key="w.id"
        :data-tile-id="w.id"
        class="tile-cell"
        :class="{
          'is-dragging': dragId === w.id && !settling,
          'is-settling': dragId === w.id && settling,
          'is-resizing': resizeId === w.id,
          'is-edit': editMode
        }"
        :style="{
          gridColumn: `span ${spanFor(w).w}`,
          gridRow: `span ${spanFor(w).h}`,
          ...(dragId === w.id ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : {})
        }"
        @pointerdown="onDragStart($event, w.id)"
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
          :class="{ 'pointer-events-none ring-2 ring-primary/40 rounded-[var(--ui-radius)]': editMode }"
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

    <!-- board create / settings modal -->
    <UModal
      v-model:open="boardModalOpen"
      :title="boardDraft.id ? 'Board settings' : 'New board'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="boardDraft.name"
              placeholder="e.g. Ops, Personal, Status"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="boardDraft.id"
            label="Default board"
            description="The board the home page opens on."
          >
            <USwitch v-model="boardDraft.isDefault" />
          </UFormField>

          <UFormField
            label="Public"
            description="Anyone with the link can view this board (read-only), no sign-in needed."
          >
            <USwitch v-model="boardDraft.isPublic" />
          </UFormField>

          <UFormField
            v-if="boardDraft.isPublic"
            label="Allow public triggering"
            description="Public visitors can run every flow on this board. Overrides each flow's own setting."
          >
            <USwitch v-model="boardDraft.publicTrigger" />
          </UFormField>

          <div
            v-if="boardDraft.id && boardDraft.isPublic && publicUrl"
            class="flex items-center gap-2 rounded-lg border border-default bg-elevated/50 p-2"
          >
            <code class="min-w-0 flex-1 truncate text-xs text-muted">{{ publicUrl }}</code>
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="soft"
              size="xs"
              @click="copyPublicUrl"
            />
          </div>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            v-if="boardDraft.id"
            label="Delete board"
            icon="i-lucide-trash-2"
            color="error"
            variant="soft"
            @click="deleteActiveBoard"
          />
          <div class="ml-auto flex gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="close"
            />
            <UButton
              label="Save"
              :loading="boardBusy"
              @click="saveBoard"
            />
          </div>
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
  touch-action: manipulation;
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.25s ease,
    box-shadow 0.2s ease;
}

.tile-cell.is-edit {
  cursor: grab;
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

/* the lifted tile tracks the pointer instantly (no transform easing) and floats
   above the rest with a grabbed cursor + shadow */
.tile-cell.is-dragging {
  z-index: 30;
  cursor: grabbing;
  opacity: 0.92;
  transition: none;
  animation: none;
}
.tile-cell.is-dragging :deep(.group) {
  box-shadow: 0 18px 40px -12px rgb(0 0 0 / 0.45);
  transform: scale(1.03);
  transition: transform 0.18s ease;
}

/* drop animation: glide from the release point into the grid slot */
.tile-cell.is-settling {
  z-index: 30;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
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
  .tile-enter-active,
  .tile-leave-active,
  .resize-handle,
  .tile-cell.is-dragging :deep(.group) {
    transition: none;
  }
  .is-editing .tile-cell {
    animation: none;
  }
}
</style>
