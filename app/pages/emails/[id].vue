<script setup lang="ts">
/**
 * Email designer — the 3-pane editor.
 *
 *   ┌──────────┬────────────────────┬────────────┐
 *   │   chat   │   live preview     │ inspector  │
 *   │ (AI SDK) │ (iframe, click to  │ (selected  │
 *   │          │  select a block)   │  block /   │
 *   │          │                    │  settings) │
 *   └──────────┴────────────────────┴────────────┘
 *
 * The AI chat (left) talks to /api/email-projects/:id/chat using the Vercel AI
 * SDK `Chat` class, which pairs with Nuxt UI's chat components. We send the
 * current document + the selected block id on every turn; the server streams
 * back assistant text AND a `data-document` part whenever a tool edits the
 * email, which we apply live to `document`. The center preview and right
 * inspector are a conventional click-to-select / form editor over the same
 * `document`, with debounced autosave. AI edits and manual edits share one
 * source of truth.
 */
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport, isTextUIPart, type UIMessage } from 'ai'
import { isPartStreaming } from '@nuxt/ui/utils/ai'
import type { EmailBlock, EmailBlockType, EmailDocument } from '#shared/email/blocks'
import { addBlock, moveBlock, updateBlock } from '#shared/email/ops'
import { renderEmailHtml } from '#shared/email/render'
import { isStarterEmailDocument, type EmailTemplateDefinition } from '#shared/email/templates'
import type { UploadedAsset } from '~/composables/useEmailAssets'

import EmailPreview from '~/components/email/EmailPreview.vue'
import EmailInspector from '~/components/email/EmailInspector.vue'
import EmailTemplatePicker from '~/components/email/EmailTemplatePicker.vue'
import EmailUploadModal from '~/components/email/EmailUploadModal.vue'

const route = useRoute()
const toast = useToast()
const id = route.params.id as string

definePageMeta({ layout: false })

interface ProjectResponse {
  id: string
  name: string
  document: EmailDocument
  messages: Array<{ id: string, role: string, parts: UIMessage['parts'] }>
}

const { data: project, error } = await useFetch<ProjectResponse>(`/api/email-projects/${id}`, {
  key: `email-project-${id}`
})
if (error.value || !project.value) {
  throw createError({ statusCode: 404, statusMessage: 'Email project not found' })
}

// ---- shared state ---------------------------------------------------------
const document = ref<EmailDocument>(project.value.document)
const selectedId = ref<string | null>(null)
const name = ref(project.value.name)
const input = ref('')
const templateOpen = ref(false)

const previewDevices = [
  { id: 'desktop', label: 'Desktop', icon: 'i-lucide-monitor', width: 960, height: 720 },
  { id: 'tablet', label: 'Tablet', icon: 'i-lucide-tablet', width: 768, height: 900 },
  { id: 'phone', label: 'Phone', icon: 'i-lucide-smartphone', width: 390, height: 844 },
  { id: 'compact', label: 'Compact', icon: 'i-lucide-panel-top', width: 320, height: 568 }
] as const
const previewDeviceId = ref<(typeof previewDevices)[number]['id']>('desktop')
const previewDevice = computed(() => previewDevices.find(d => d.id === previewDeviceId.value) ?? previewDevices[0])
const previewDeviceItems = computed(() => [
  previewDevices.map(device => ({
    label: device.label,
    description: `${device.width} × ${device.height}`,
    icon: device.icon,
    trailingIcon: previewDeviceId.value === device.id ? 'i-lucide-check' : undefined,
    onSelect: () => {
      previewDeviceId.value = device.id
    }
  }))
])
const mobilePanel = ref<'chat' | 'preview' | 'edit'>('preview')
const mobilePanelItems = [
  { label: 'Chat', value: 'chat', icon: 'i-lucide-sparkles' },
  { label: 'Preview', value: 'preview', icon: 'i-lucide-monitor' },
  { label: 'Edit', value: 'edit', icon: 'i-lucide-sliders-horizontal' }
]
const isMobileWorkspace = ref(false)

function updateMobileWorkspace() {
  if (!import.meta.client) return
  isMobileWorkspace.value = window.innerWidth < 1024
  if (isMobileWorkspace.value && previewDeviceId.value === 'desktop') {
    previewDeviceId.value = 'phone'
  }
}

function focusMobilePanel(panel: typeof mobilePanel.value) {
  if (isMobileWorkspace.value) mobilePanel.value = panel
}

function selectFromPreview(blockId: string | null) {
  selectedId.value = blockId
  if (blockId) focusMobilePanel('edit')
}

// ---- autosave (document + name) -------------------------------------------
const saving = ref(false)
const saveDoc = useDebounceFn(async () => {
  saving.value = true
  try {
    await $fetch(`/api/email-projects/${id}`, {
      method: 'PUT',
      body: { document: document.value, name: name.value }
    })
  } catch {
    toast.add({ title: 'Autosave failed', color: 'error' })
  } finally {
    saving.value = false
  }
}, 800)
watch([document, name], saveDoc, { deep: true })

// ---- AI chat --------------------------------------------------------------
const chat = new Chat<UIMessage>({
  messages: (project.value.messages ?? []) as UIMessage[],
  transport: new DefaultChatTransport({
    api: `/api/email-projects/${id}/chat`,
    // attach the live document + current selection to every request body
    prepareSendMessagesRequest: ({ messages, body }) => ({
      body: {
        ...body,
        messages,
        document: document.value,
        selectedId: selectedId.value
      }
    })
  }),
  // server streams a `data-document` part each time a tool edits the email
  onData: (part) => {
    if (part.type === 'data-document' && part.data) {
      document.value = part.data as unknown as EmailDocument
    }
  },
  onError: (err) => {
    toast.add({ title: 'AI error', description: err.message, color: 'error' })
  }
})

function onSubmit() {
  const text = input.value.trim()
  if (!text) return
  chat.sendMessage({ text })
  input.value = ''
}

// surface the selected block in the prompt placeholder so it's obvious the AI
// will act on it
const promptPlaceholder = computed(() => {
  const b = selectedId.value ? document.value.blocks.find(x => x.id === selectedId.value) : null
  return b
    ? `Ask the AI to change the selected ${b.type}…`
    : 'Describe the email you want, or ask for a change…'
})

onMounted(() => {
  updateMobileWorkspace()
  window.addEventListener('resize', updateMobileWorkspace)

  if (!chat.messages.length && isStarterEmailDocument(document.value)) {
    templateOpen.value = true
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileWorkspace)
})

// ---- manual block insertion ----------------------------------------------
const addItems = [
  [
    { label: 'Heading', icon: 'i-lucide-heading', onSelect: () => insert('heading') },
    { label: 'Text', icon: 'i-lucide-type', onSelect: () => insert('text') },
    { label: 'Button', icon: 'i-lucide-mouse-pointer-click', onSelect: () => insert('button') },
    { label: 'Image', icon: 'i-lucide-image', onSelect: () => insert('image') },
    { label: 'Divider', icon: 'i-lucide-minus', onSelect: () => insert('divider') },
    { label: 'Spacer', icon: 'i-lucide-move-vertical', onSelect: () => insert('spacer') },
    { label: 'Columns', icon: 'i-lucide-columns-2', onSelect: () => insert('columns') },
    { label: 'Custom HTML', icon: 'i-lucide-code', onSelect: () => insert('html') }
  ],
  [
    { label: 'Upload image…', icon: 'i-lucide-image-up', onSelect: () => openUpload('image') },
    { label: 'Upload file…', icon: 'i-lucide-file-up', onSelect: () => openUpload('file') }
  ]
]
function insert(type: EmailBlockType) {
  const res = addBlock(document.value, type)
  document.value = res.doc
  selectedId.value = res.id
  focusMobilePanel('edit')
}

function applyTemplate(payload: { template: EmailTemplateDefinition, document: EmailDocument }) {
  document.value = payload.document
  name.value = payload.template.name
  selectedId.value = null
  templateOpen.value = false
  toast.add({ title: `Applied “${payload.template.name}”`, color: 'success' })
}

function applyBlank(nextDocument: EmailDocument) {
  document.value = nextDocument
  selectedId.value = null
  templateOpen.value = false
}

// ---- S3 uploads -----------------------------------------------------------
const uploadOpen = ref(false)
const uploadMode = ref<'image' | 'file'>('image')
function openUpload(mode: 'image' | 'file') {
  uploadMode.value = mode
  uploadOpen.value = true
}
function onUploaded(asset: UploadedAsset) {
  if (asset.kind === 'image') {
    // insert an image block pointing at the uploaded asset
    const res = addBlock(document.value, 'image', {
      src: asset.url,
      alt: asset.name.replace(/\.[a-z0-9]+$/i, '')
    })
    document.value = res.doc
    selectedId.value = res.id
    focusMobilePanel('edit')
  } else {
    // non-image file → a text block with a download link
    const res = addBlock(document.value, 'text', { align: 'center' })
    const withLink = updateBlock(res.doc, res.id, {
      html: `<a href="${asset.url}">Download ${asset.name}</a>`
    })
    document.value = withLink.doc
    selectedId.value = res.id
    focusMobilePanel('edit')
  }
}

// ---- export ---------------------------------------------------------------
async function copyHtml() {
  try {
    await navigator.clipboard.writeText(renderEmailHtml(document.value))
    toast.add({ title: 'Email HTML copied to clipboard', icon: 'i-lucide-clipboard-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy', color: 'error' })
  }
}

function blockLabel(b: EmailBlock): string {
  if (b.type === 'heading') return b.text || 'Heading'
  if (b.type === 'text') return b.html.replace(/<[^>]+>/g, '').slice(0, 30) || 'Text'
  if (b.type === 'button') return b.label || 'Button'
  return b.type
}

// ---- block outline drag/drop ----------------------------------------------
const draggingBlockId = ref<string | null>(null)
const dropIndex = ref<number | null>(null)

const orderedBlocks = computed(() => {
  const id = draggingBlockId.value
  const insertionIndex = dropIndex.value
  if (!id || insertionIndex == null) return document.value.blocks

  const from = document.value.blocks.findIndex(b => b.id === id)
  if (from === -1) return document.value.blocks

  const next = [...document.value.blocks]
  const [dragged] = next.splice(from, 1)
  if (!dragged) return document.value.blocks

  const to = Math.max(0, Math.min(from < insertionIndex ? insertionIndex - 1 : insertionIndex, next.length))
  next.splice(to, 0, dragged)
  return next
})

function resetBlockDrag() {
  draggingBlockId.value = null
  dropIndex.value = null
}

function setBlockDropIndex(index: number) {
  if (!draggingBlockId.value) return
  dropIndex.value = Math.max(0, Math.min(index, document.value.blocks.length))
}

function blockDropIndex(e: DragEvent, b: EmailBlock): number {
  const index = document.value.blocks.findIndex(block => block.id === b.id)
  if (index === -1) return document.value.blocks.length

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY > rect.top + rect.height / 2 ? index + 1 : index
}

function onBlockDragStart(e: DragEvent, b: EmailBlock) {
  draggingBlockId.value = b.id
  dropIndex.value = document.value.blocks.findIndex(block => block.id === b.id)
  selectedId.value = b.id

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', b.id)
  }
}

function onBlockDragOver(e: DragEvent, b: EmailBlock) {
  if (!draggingBlockId.value || b.id === draggingBlockId.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  setBlockDropIndex(blockDropIndex(e, b))
}

function onBlockListDragOver(e: DragEvent) {
  if (!draggingBlockId.value) return
  e.preventDefault()
  if ((e.target as HTMLElement | null)?.closest('[data-email-block-id]')) return
  setBlockDropIndex(document.value.blocks.length)
}

function onBlockDrop(e: DragEvent) {
  e.preventDefault()
  const id = draggingBlockId.value ?? e.dataTransfer?.getData('text/plain')
  if (!id) {
    resetBlockDrag()
    return
  }

  const from = document.value.blocks.findIndex(b => b.id === id)
  const insertionIndex = dropIndex.value ?? from
  const to = from < insertionIndex ? insertionIndex - 1 : insertionIndex

  if (from !== -1 && to !== from) {
    const res = moveBlock(document.value, id, to)
    if (res.ok) document.value = res.doc
  }

  selectedId.value = id
  resetBlockDrag()
}

function onPreviewMove({ id, to }: { id: string, to: number }) {
  const res = moveBlock(document.value, id, to)
  if (res.ok) document.value = res.doc
  selectedId.value = id
}

useHead({ title: () => `${name.value} · Email designer` })
</script>

<template>
  <div class="flex h-[calc(100dvh-64px)] overflow-hidden flex-col bg-default">
    <!-- top bar -->
    <header class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2.5 sm:gap-3 sm:px-4">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
          to="/emails"
          aria-label="Back to projects"
        />
        <UInput
          v-model="name"
          variant="none"
          class="min-w-0 flex-1 font-semibold"
          :ui="{ base: 'text-highlighted text-base px-0' }"
          placeholder="Untitled email"
        />
        <span
          class="flex shrink-0 items-center gap-1.5 text-xs text-dimmed"
          :aria-label="saving ? 'Saving' : 'Saved'"
        >
          <UIcon
            :name="saving ? 'i-lucide-loader-circle' : 'i-lucide-check'"
            :class="saving ? 'animate-spin' : 'text-success'"
            class="size-3.5"
          />
          <span class="hidden sm:inline">{{ saving ? 'Saving…' : 'Saved' }}</span>
        </span>
      </div>

      <div class="flex w-full min-w-0 items-center gap-2 overflow-x-auto sm:w-auto sm:overflow-visible">
        <UDropdownMenu :items="previewDeviceItems">
          <UButton
            :icon="previewDevice.icon"
            :label="previewDevice.label"
            color="neutral"
            variant="outline"
            size="sm"
            trailing-icon="i-lucide-chevron-down"
            :aria-label="`Preview device: ${previewDevice.label}`"
            :ui="{ label: 'hidden sm:inline', trailingIcon: 'hidden sm:block' }"
          />
        </UDropdownMenu>

        <UDropdownMenu :items="addItems">
          <UButton
            icon="i-lucide-plus"
            label="Add block"
            color="neutral"
            variant="outline"
            size="sm"
            :ui="{ label: 'hidden sm:inline' }"
          />
        </UDropdownMenu>

        <UButton
          icon="i-lucide-layout-template"
          label="Templates"
          color="neutral"
          variant="outline"
          size="sm"
          :ui="{ label: 'hidden sm:inline' }"
          @click="templateOpen = true"
        />

        <UButton
          icon="i-lucide-code-xml"
          label="Copy HTML"
          size="sm"
          :ui="{ label: 'hidden sm:inline' }"
          @click="copyHtml"
        />
      </div>
    </header>

    <UTabs
      v-model="mobilePanel"
      :items="mobilePanelItems"
      :content="false"
      color="primary"
      class="shrink-0 border-b border-default px-3 py-2 lg:hidden"
    />

    <!-- 3-pane body -->
    <div class="min-h-0 flex-1 lg:grid lg:grid-cols-[340px_1fr_300px]">
      <!-- chat -->
      <aside
        class="h-full min-h-0 flex-col lg:flex lg:border-r lg:border-default"
        :class="mobilePanel === 'chat' ? 'flex' : 'hidden'"
      >
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UIcon
            name="i-lucide-sparkles"
            class="size-4 text-primary"
          />
          <span class="text-sm font-semibold text-highlighted">AI copilot</span>
        </div>

        <div
          v-if="!chat.messages.length"
          class="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center"
        >
          <div class="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <UIcon
              name="i-lucide-sparkles"
              class="size-5"
            />
          </div>
          <p class="mt-3 text-sm font-medium text-highlighted">
            Describe your email
          </p>
          <p class="mt-1 text-xs text-muted">
            “A product launch announcement with a hero image, two feature columns and a CTA button.”
          </p>
          <UButton
            class="mt-4"
            icon="i-lucide-layout-template"
            label="Browse templates"
            color="neutral"
            variant="outline"
            size="sm"
            @click="templateOpen = true"
          />
        </div>

        <!-- Chat Messages -->
        <UChatMessages
          v-else
          :messages="chat.messages"
          :status="chat.status"
          :assistant="{ avatar: { icon: 'i-lucide-sparkles' } }"
          class="min-h-0 flex-1 py-4 overflow-auto"
          :spacing-offset="120"
        >
          <template #content="{ message }">
            <template
              v-for="(part, i) in message.parts"
              :key="`${message.id}-${i}`"
            >
              <Comark
                v-if="isTextUIPart(part) && message.role === 'assistant'"
                :markdown="part.text"
                :streaming="isPartStreaming(part)"
                class="*:first:mt-0 *:last:mb-0"
              />
              <p
                v-else-if="isTextUIPart(part)"
                class="whitespace-pre-wrap"
              >
                {{ part.text }}
              </p>
              <UChatTool
                v-else-if="part.type?.startsWith('tool-')"
                :text="part.type.replace('tool-', '').replace(/_/g, ' ')"
                icon="i-lucide-wand-2"
              />
            </template>
          </template>
        </UChatMessages>

        <div class="border-t border-default p-3">
          <UChatPrompt
            v-model="input"
            :error="chat.error"
            :placeholder="promptPlaceholder"
            variant="subtle"
            @submit="onSubmit"
          >
            <UChatPromptSubmit
              :status="chat.status"
              @stop="chat.stop()"
              @reload="chat.regenerate()"
            />
          </UChatPrompt>
        </div>
      </aside>

      <!-- preview -->
      <main
        class="h-full min-h-0 lg:block"
        :class="mobilePanel === 'preview' ? 'block' : 'hidden'"
      >
        <EmailPreview
          :document="document"
          :selected-id="selectedId"
          :device="previewDevice"
          @select="selectFromPreview"
          @move="onPreviewMove"
        />
      </main>

      <!-- inspector -->
      <aside
        class="h-full min-h-0 flex-col lg:flex lg:border-l lg:border-default"
        :class="mobilePanel === 'edit' ? 'flex' : 'hidden'"
      >
        <EmailInspector
          :document="document"
          :selected-id="selectedId"
          @update:document="document = $event"
          @select="selectedId = $event"
        />

        <!-- block list / outline -->
        <div class="border-t border-default">
          <div class="px-4 py-2 text-xs font-medium uppercase tracking-wide text-dimmed">
            Blocks
          </div>
          <TransitionGroup
            tag="ul"
            name="email-block-list"
            class="max-h-48 overflow-y-auto pb-2"
            @dragover="onBlockListDragOver"
            @drop="onBlockDrop"
          >
            <li
              v-for="b in orderedBlocks"
              :key="b.id"
              :data-email-block-id="b.id"
              draggable="true"
              class="email-block-list-item"
              :class="draggingBlockId === b.id ? 'opacity-55' : ''"
              @dragstart="onBlockDragStart($event, b)"
              @dragover="onBlockDragOver($event, b)"
              @drop="onBlockDrop"
              @dragend="resetBlockDrag"
            >
              <button
                class="flex w-full cursor-grab items-center gap-2 px-4 py-1.5 text-left text-sm transition active:cursor-grabbing"
                :class="selectedId === b.id ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-elevated/60'"
                @click="selectedId = b.id"
              >
                <UIcon
                  name="i-lucide-grip-vertical"
                  class="size-3.5 shrink-0 text-dimmed"
                />
                <span class="truncate">{{ blockLabel(b) }}</span>
              </button>
            </li>
          </TransitionGroup>
        </div>
      </aside>
    </div>

    <EmailUploadModal
      v-model:open="uploadOpen"
      :title="uploadMode === 'image' ? 'Upload an image' : 'Upload a file'"
      :accept="uploadMode === 'image' ? 'image/*' : undefined"
      @uploaded="onUploaded"
    />

    <EmailTemplatePicker
      v-model:open="templateOpen"
      title="Start from a template"
      description="Pick a structure for this email, or keep the blank starter."
      @select="applyTemplate"
      @blank="applyBlank"
    />
  </div>
</template>

<style scoped>
.email-block-list-item {
  transition:
    opacity 140ms ease,
    transform 180ms ease,
    background-color 140ms ease;
}

.email-block-list-move,
.email-block-list-enter-active,
.email-block-list-leave-active {
  transition: transform 180ms ease, opacity 140ms ease;
}

.email-block-list-enter-from,
.email-block-list-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
