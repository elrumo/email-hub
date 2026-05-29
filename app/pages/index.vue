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
  if (!editMode.value) return
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

    <div
      v-else
      class="grid auto-rows-[8rem] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      <div
        v-for="w in widgets"
        :key="w.id"
        :draggable="editMode"
        class="contents"
        @dragstart="onDragStart(w.id)"
        @dragover.prevent
        @drop="onDrop(w.id)"
      >
        <WidgetTile
          :widget="w"
          :shortcuts="shortcuts"
          :flows="flows"
          :monitors="monitors"
          :catalog="catalog"
          :ping="pings[w.refId ?? '']"
          :edit-mode="editMode"
          :class="{ 'cursor-grab ring-2 ring-primary/40 rounded-[var(--ui-radius)]': editMode }"
          @remove="removeWidget(w)"
        />
      </div>
    </div>

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
