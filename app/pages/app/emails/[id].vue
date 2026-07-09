<script setup lang="ts">
/**
 * Postcard editor — the 3-pane studio.
 *
 *   ┌──────────┬────────────────────┬────────────┐
 *   │ Postcard │   live preview     │  Design /  │
 *   │   AI     │ (iframe, click to  │  Variables │
 *   │  chat    │  select a block)   │  inspector │
 *   └──────────┴────────────────────┴────────────┘
 *
 * One `document` is the source of truth. The AI chat streams `data-document`
 * parts whenever a tool edits the email; the preview and inspector are a
 * conventional click-to-select editor over the same document, with debounced
 * autosave. Template variable sample values are merged into the preview only.
 */
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport, isTextUIPart, type UIMessage } from 'ai'
import type { EmailBlock, EmailBlockType, EmailDocument } from '#shared/email/blocks'
import { findBlock } from '#shared/email/blocks'
import { addBlock, moveBlock } from '#shared/email/ops'
import { renderEmailHtml } from '#shared/email/render'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { isStarterEmailDocument, type EmailTemplateDefinition } from '#shared/email/templates'
import type { TemplateVariable } from '~~/server/utils/parse'

import { useUndoRedo, type EditorSnapshot } from '~/composables/useUndoRedo'

import EmailPreview from '~/components/email/EmailPreview.vue'
import EmailInspector from '~/components/email/EmailInspector.vue'
import EmailVariables from '~/components/email/EmailVariables.vue'
import EmailTemplatePicker from '~/components/email/EmailTemplatePicker.vue'

definePageMeta({ layout: false })

const route = useRoute()
const toast = useToast()
const colorMode = useColorMode()
const id = route.params.id as string

interface ProjectResponse {
  access: 'owner' | 'edit' | 'view'
  project: { id: string, name: string, document: EmailDocument, variables: TemplateVariable[], projectId: string | null, folderId: string | null, shareMode: string | null, shareToken: string | null, updatedAt: number }
  messages: Array<{ id: string, role: string, parts: UIMessage['parts'] }>
}

const shareTokenParam = (route.query.share as string) || null
const apiSuffix = shareTokenParam ? `?share=${encodeURIComponent(shareTokenParam)}` : ''

const { data, error } = await useFetch<ProjectResponse>(`/api/emails/${id}${apiSuffix}`, { key: `project-${id}` })
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Email project not found' })
}

const access = computed(() => data.value?.access ?? 'owner')
const isOwner = computed(() => access.value === 'owner')

const backTo = computed(() =>
  data.value?.project.projectId ? `/app/projects/${data.value.project.projectId}` : '/app'
)

// ---- shared state ---------------------------------------------------------
const document = ref<EmailDocument>(data.value.project.document)
const variables = ref<TemplateVariable[]>(data.value.project.variables ?? [])
const name = ref(data.value.project.name)
const selectedId = ref<string | null>(null)
const input = ref('')
const templateOpen = ref(false)
const rightTab = ref<'design' | 'variables'>('design')

// ---- undo / redo -----------------------------------------------------------
const { push: pushHistory, undo: undoPop, redo: redoPop, clear: clearHistory, canUndo, canRedo } = useUndoRedo()
let skipHistory = false

function snapshot(): EditorSnapshot {
  return { document: document.value, name: name.value, variables: variables.value }
}

function applySnapshot(snap: EditorSnapshot) {
  skipHistory = true
  skipNextSave = true
  document.value = snap.document
  name.value = snap.name
  variables.value = snap.variables
}

function undo() {
  const prev = undoPop(snapshot())
  if (prev) applySnapshot(prev)
}

function redo() {
  const next = redoPop(snapshot())
  if (next) applySnapshot(next)
}

// Push to history on user-initiated document changes (not sync/AI/undo).
watch(document, (_next, prev) => {
  if (skipHistory) { skipHistory = false; return }
  pushHistory({ document: prev, name: name.value, variables: variables.value })
})

// Keyboard shortcuts.
onMounted(() => {
  function onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
    if (e.key === 'y') { e.preventDefault(); redo() }
  }
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
})

// Preview merges sample values so previews look real; the saved doc keeps {{ }}.
const previewDocument = computed(() => {
  const vars: Record<string, string> = {}
  for (const v of variables.value) if (v.defaultValue != null) vars[v.key] = v.defaultValue
  return Object.keys(vars).length ? applyTemplateVariables(document.value, vars) : document.value
})

const previewDevices = [
  { id: 'desktop', label: 'Desktop', icon: 'i-lucide-monitor', width: 720, height: 720 },
  { id: 'phone', label: 'Phone', icon: 'i-lucide-smartphone', width: 390, height: 760 }
] as const
const previewDeviceId = ref<(typeof previewDevices)[number]['id']>('desktop')
const previewDevice = computed(() => previewDevices.find(d => d.id === previewDeviceId.value) ?? previewDevices[0])

// ---- autosave -------------------------------------------------------------
const saving = ref(false)
// Per-tab identity for multiplayer echo suppression.
const actorId = ref('')
let skipNextSave = false

const saveDoc = useDebounceFn(async () => {
  if (access.value === 'view') return
  saving.value = true
  try {
    const res = await $fetch<{ project: { variables: TemplateVariable[] } }>(`/api/emails/${id}${apiSuffix}`, {
      method: 'PUT',
      body: { document: document.value, name: name.value, variables: variables.value, actorId: actorId.value }
    })
    // Keep variables reconciled with what the server stored. Only reassign on
    // real changes — the response is always a fresh array, and reassigning
    // unconditionally would retrigger the watcher and autosave forever.
    if (JSON.stringify(res.project.variables) !== JSON.stringify(variables.value)) {
      variables.value = res.project.variables
    }
  } catch {
    toast.add({ title: 'Autosave failed', color: 'error' })
  } finally {
    saving.value = false
  }
}, 800)
watch([document, name, variables], () => {
  if (skipNextSave) {
    skipNextSave = false
    return
  }
  saveDoc()
}, { deep: true })

// ---- live multiplayer sync --------------------------------------------------
// Every open tab of this email streams document updates (SSE backed by Parse
// Live Queries). Saves from other collaborators appear in place.
let liveSource: EventSource | null = null
onMounted(() => {
  actorId.value = crypto.randomUUID()
  liveSource = new EventSource(`/api/emails/${id}/events${apiSuffix}`)
  liveSource.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data) as { document?: EmailDocument, variables?: TemplateVariable[], name?: string, actorId?: string | null }
      if (!payload?.document || payload.actorId === actorId.value) return
      skipNextSave = true
      skipHistory = true
      document.value = payload.document
      if (payload.variables) variables.value = payload.variables
      if (payload.name) name.value = payload.name
    } catch { /* malformed frame — ignore */ }
  }
})
onBeforeUnmount(() => liveSource?.close())

// ---- sharing ----------------------------------------------------------------
const shareOpen = ref(false)
const shareMode = ref<'off' | 'view' | 'edit'>((data.value.project.shareMode as 'view' | 'edit' | null) ?? 'off')
const shareToken = ref<string | null>(data.value.project.shareToken)
const shareBusy = ref(false)

const shareUrl = computed(() =>
  shareToken.value && import.meta.client ? `${window.location.origin}/share/${shareToken.value}` : null
)

const shareModes = [
  { value: 'off', label: 'Off — only you', description: 'No one else can open this email.' },
  { value: 'view', label: 'Anyone with the link can view', description: 'A clean browser preview, no account needed.' },
  { value: 'edit', label: 'Link viewers can view · signed-in can edit', description: 'Signed-up users with the link co-edit live.' }
]

async function setShareMode(mode: 'off' | 'view' | 'edit') {
  shareBusy.value = true
  try {
    const res = await $fetch<{ mode: typeof mode, token: string | null }>(`/api/emails/${id}/share`, {
      method: 'POST',
      body: { mode }
    })
    shareMode.value = res.mode
    shareToken.value = res.token
  } catch (e: any) {
    toast.add({ title: e?.data?.statusMessage || 'Could not update sharing.', color: 'error' })
  } finally {
    shareBusy.value = false
  }
}

async function copyShareUrl() {
  if (!shareUrl.value) return
  await navigator.clipboard.writeText(shareUrl.value)
  toast.add({ title: 'Share link copied', icon: 'i-lucide-clipboard-check', color: 'success' })
}

// ---- AI chat --------------------------------------------------------------
const chat = new Chat<UIMessage>({
  messages: (data.value.messages ?? []) as UIMessage[],
  transport: new DefaultChatTransport({
    api: `/api/emails/${id}/chat`,
    prepareSendMessagesRequest: ({ messages, body }) => ({
      body: { ...body, messages, document: document.value, selectedId: selectedId.value }
    })
  }),
  onData: (part) => {
    if (part.type === 'data-document' && part.data) {
      skipHistory = true
      document.value = part.data as unknown as EmailDocument
    }
  },
  onError: (err) => {
    toast.add({ title: 'Postcard AI error', description: err.message, color: 'error' })
  }
})

function onSubmit() {
  const text = input.value.trim()
  if (!text) return
  chat.sendMessage({ text })
  input.value = ''
}

const selectedBlock = computed<EmailBlock | null>(() =>
  selectedId.value ? findBlock(document.value.blocks, selectedId.value) : null
)

const promptPlaceholder = computed(() =>
  selectedBlock.value
    ? `Ask Postcard AI to change the selected ${selectedBlock.value.type}…`
    : 'Describe the email you want, or ask for a change…'
)

// v0-style quick actions — one tap sends a scoped or whole-email prompt.
const quickActions = computed(() =>
  selectedBlock.value
    ? [
        { label: 'Improve this', prompt: 'Improve the selected block: sharpen the copy and polish its styling. Keep its intent.' },
        { label: 'Shorten', prompt: 'Make the selected block shorter and punchier without losing meaning.' },
        { label: 'Make it pop', prompt: 'Make the selected block stand out more — stronger hierarchy, better contrast, without clashing with the theme.' }
      ]
    : [
        { label: 'Improve copy', prompt: 'Improve the copy across the whole email: clearer, more concrete, more persuasive. Keep the layout.' },
        { label: 'Polish design', prompt: 'Polish the design: spacing rhythm, hierarchy and color contrast. Keep the content.' },
        { label: 'Add footer', prompt: 'Add a proper muted footer with the sender address line and an unsubscribe link.' },
        { label: 'Shorter', prompt: 'Tighten the whole email — fewer words, same message.' }
      ]
)

const busyChat = computed(() => chat.status === 'streaming' || chat.status === 'submitted')

function sendQuick(prompt: string) {
  if (busyChat.value) return
  chat.sendMessage({ text: prompt })
}

onMounted(() => {
  if (!chat.messages.length && isStarterEmailDocument(document.value)) templateOpen.value = true
})

// ---- manual editing -------------------------------------------------------
const addItems = [[
  { label: 'Heading', icon: 'i-lucide-heading', onSelect: () => insert('heading') },
  { label: 'Text', icon: 'i-lucide-type', onSelect: () => insert('text') },
  { label: 'Button', icon: 'i-lucide-mouse-pointer-click', onSelect: () => insert('button') },
  { label: 'Image', icon: 'i-lucide-image', onSelect: () => insert('image') },
  { label: 'Divider', icon: 'i-lucide-minus', onSelect: () => insert('divider') },
  { label: 'Spacer', icon: 'i-lucide-move-vertical', onSelect: () => insert('spacer') },
  { label: 'Columns', icon: 'i-lucide-columns-2', onSelect: () => insert('columns') },
  { label: 'Custom HTML', icon: 'i-lucide-code', onSelect: () => insert('html') }
]]
function insert(type: EmailBlockType) {
  const res = addBlock(document.value, type)
  document.value = res.doc
  selectedId.value = res.id
  rightTab.value = 'design'
}

function applyTemplate(payload: { template: EmailTemplateDefinition, document: EmailDocument }) {
  skipHistory = true
  document.value = payload.document
  name.value = payload.template.name
  selectedId.value = null
  templateOpen.value = false
  clearHistory()
  toast.add({ title: `Applied “${payload.template.name}”`, color: 'success' })
}
function applyBlank(next: EmailDocument) {
  skipHistory = true
  document.value = next
  selectedId.value = null
  templateOpen.value = false
  clearHistory()
}

function onPreviewMove({ id: bid, to }: { id: string, to: number }) {
  const res = moveBlock(document.value, bid, to)
  if (res.ok) document.value = res.doc
  selectedId.value = bid
}

async function copyHtml() {
  try {
    await navigator.clipboard.writeText(renderEmailHtml(document.value))
    toast.add({ title: 'Email HTML copied', icon: 'i-lucide-clipboard-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy', color: 'error' })
  }
}

function blockLabel(b: EmailBlock): string {
  if (b.type === 'heading') return b.text || 'Heading'
  if (b.type === 'text') return b.html.replace(/<[^>]+>/g, '').slice(0, 28) || 'Text'
  if (b.type === 'button') return b.label || 'Button'
  return b.type
}

useHead({ title: () => `${name.value} · Postcard` })
</script>

<template>
  <div class="h-screen p-0 sm:p-3 bg-(--pc-bg)">
    <div class="pc-window h-full flex flex-col">
      <!-- Titlebar -->
      <div class="pc-titlebar pc-material shrink-0">
        <TrafficLights />
        <UButton :to="backTo" color="neutral" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
        <UInput
          v-model="name"
          variant="none"
          placeholder="Untitled email"
          :ui="{ base: 'text-sm font-medium px-0' }"
          class="min-w-0 flex-1 max-w-xs"
        />
        <span class="flex items-center gap-1.5 text-xs pc-dim">
          <UIcon :name="saving ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="saving ? 'animate-spin' : 'text-green-500'" class="size-3.5" />
          <span class="hidden sm:inline">{{ saving ? 'Saving…' : 'Saved' }}</span>
        </span>
        <div class="flex-1" />
        <UButton icon="i-lucide-undo-2" color="neutral" variant="ghost" size="xs" aria-label="Undo" :disabled="!canUndo" @click="undo" />
        <UButton icon="i-lucide-redo-2" color="neutral" variant="ghost" size="xs" aria-label="Redo" :disabled="!canRedo" @click="redo" />
        <UDropdownMenu :items="addItems">
          <UButton icon="i-lucide-plus" label="Add" color="neutral" variant="ghost" size="xs" :ui="{ label: 'hidden sm:inline' }" />
        </UDropdownMenu>
        <UButton icon="i-lucide-layout-template" color="neutral" variant="ghost" size="xs" aria-label="Templates" @click="templateOpen = true" />
        <UButton
          v-if="isOwner"
          :icon="shareMode === 'off' ? 'i-lucide-share-2' : 'i-lucide-globe'"
          :label="shareMode === 'off' ? 'Share' : 'Shared'"
          :color="shareMode === 'off' ? 'neutral' : 'primary'"
          variant="ghost"
          size="xs"
          :ui="{ label: 'hidden sm:inline' }"
          @click="shareOpen = true"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
          aria-label="Toggle theme"
          @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
        />
        <UButton icon="i-lucide-code-xml" label="Copy HTML" size="xs" :ui="{ label: 'hidden sm:inline' }" @click="copyHtml" />
      </div>

      <!-- 3 panes -->
      <div class="min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_320px]">
        <!-- AI chat (owner) / collaborator note -->
        <aside v-if="!isOwner" class="hidden relative lg:flex h-full min-h-0 flex-col border-r pc-hairline pc-sidebar-material">
          <div class="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div class="grid place-items-center w-12 h-12 rounded-2xl bg-primary-500/10 text-primary-500">
              <UIcon name="i-lucide-users" class="size-6" />
            </div>
            <p class="mt-3 text-sm font-medium">You're collaborating live</p>
            <p class="mt-1 text-xs pc-dim">
              Edits sync to everyone on this email in real time.
              {{ access === 'view' ? 'You have view-only access.' : 'Postcard AI chat is available to the owner.' }}
            </p>
          </div>
        </aside>

        <aside v-else class="hidden relative lg:flex h-full min-h-0 flex-col border-r pc-hairline pc-sidebar-material">
          <div class="flex items-center gap-2 border-b pc-hairline px-4 py-3">
            <span class="grid place-items-center w-6 h-6 rounded-md bg-primary-500 text-white">
              <UIcon name="i-lucide-sparkles" class="size-3.5" />
            </span>
            <span class="text-sm font-semibold">Postcard AI</span>
          </div>

          <div v-if="!chat.messages.length" class="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div class="grid place-items-center w-12 h-12 rounded-2xl bg-primary-500/10 text-primary-500">
              <UIcon name="i-lucide-sparkles" class="size-6" />
            </div>
            <p class="mt-3 text-sm font-medium">Describe your email</p>
            <p class="mt-1 text-xs pc-dim">“A product launch with a hero image, two feature columns and a CTA button.”</p>
            <UButton class="mt-4" icon="i-lucide-layout-template" label="Browse templates" color="neutral" variant="subtle" size="sm" @click="templateOpen = true" />
          </div>

          <UChatMessages
            v-else
            :messages="chat.messages"
            :status="chat.status"
            :assistant="{ avatar: { icon: 'i-lucide-sparkles' } }"
            class="min-h-0 flex-1 py-4 overflow-auto pc-scroll"
            :spacing-offset="120"
          >
            <template #content="{ message }">
              <template v-for="(part, i) in message.parts" :key="`${message.id}-${i}`">
                <p v-if="isTextUIPart(part)" class="whitespace-pre-wrap leading-relaxed">{{ part.text }}</p>
                <UChatTool
                  v-else-if="part.type?.startsWith('tool-')"
                  :text="part.type.replace('tool-', '').replace(/_/g, ' ')"
                  icon="i-lucide-wand-2"
                />
              </template>
            </template>
          </UChatMessages>

          <div class="border-t pc-hairline p-3 space-y-2">
            <!-- Scoped-edit context chip -->
            <div v-if="selectedBlock" class="flex items-center gap-1.5 text-xs">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-500/10 text-primary-500 pl-2.5 pr-1 py-1">
                <UIcon name="i-lucide-square-mouse-pointer" class="size-3.5" />
                <span class="max-w-[180px] truncate">Editing: {{ blockLabel(selectedBlock) }}</span>
                <button type="button" class="grid place-items-center size-4 rounded-full hover:bg-primary-500/20" aria-label="Clear selection" @click="selectedId = null">
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </span>
            </div>

            <!-- Quick actions -->
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="a in quickActions"
                :key="a.label"
                :label="a.label"
                size="xs"
                color="neutral"
                variant="subtle"
                :disabled="busyChat"
                @click="sendQuick(a.prompt)"
              />
            </div>

            <UChatPrompt v-model="input" :error="chat.error" :placeholder="promptPlaceholder" variant="subtle" @submit="onSubmit">
              <UChatPromptSubmit :status="chat.status" @stop="chat.stop()" @reload="chat.regenerate()" />
            </UChatPrompt>
          </div>
        </aside>

        <!-- preview -->
        <main class="h-full min-h-0">
          <EmailPreview
            :document="previewDocument"
            :selected-id="selectedId"
            :device="previewDevice"
            @select="selectedId = $event"
            @move="onPreviewMove"
          />
        </main>

        <!-- inspector / variables -->
        <aside class="relative hidden lg:flex h-full min-h-0 flex-col border-l pc-hairline">
          <div class="flex items-center gap-1 border-b pc-hairline p-2">
            <UButton
              label="Design"
              icon="i-lucide-sliders-horizontal"
              size="xs"
              class="flex-1 justify-center"
              :color="rightTab === 'design' ? 'primary' : 'neutral'"
              :variant="rightTab === 'design' ? 'soft' : 'ghost'"
              @click="rightTab = 'design'"
            />
            <UButton
              label="Variables"
              icon="i-lucide-braces"
              size="xs"
              class="flex-1 justify-center"
              :color="rightTab === 'variables' ? 'primary' : 'neutral'"
              :variant="rightTab === 'variables' ? 'soft' : 'ghost'"
              @click="rightTab = 'variables'"
            />
          </div>

          <div v-show="rightTab === 'design'" class="flex-1 min-h-0 flex flex-col">
            <EmailInspector
              :document="document"
              :selected-id="selectedId"
              @update:document="document = $event"
              @select="selectedId = $event"
            />
            <div class="border-t pc-hairline">
              <div class="px-4 py-2 text-xs font-medium uppercase tracking-wide pc-dim">Blocks</div>
              <ul class="max-h-44 overflow-y-auto pb-2 pc-scroll">
                <li v-for="b in document.blocks" :key="b.id">
                  <button
                    class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm transition"
                    :class="selectedId === b.id ? 'bg-primary-500/10 text-primary-500' : 'pc-dim hover:bg-black/5 dark:hover:bg-white/5'"
                    @click="selectedId = b.id"
                  >
                    <UIcon name="i-lucide-grip-vertical" class="size-3.5 shrink-0 opacity-50" />
                    <span class="truncate">{{ blockLabel(b) }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div v-show="rightTab === 'variables'" class="flex-1 min-h-0">
            <EmailVariables
              :document="document"
              :variables="variables"
              @update:variables="variables = $event"
            />
          </div>
        </aside>
      </div>
    </div>

    <EmailTemplatePicker
      v-model:open="templateOpen"
      title="Start from a template"
      description="Pick a structure for this email, or keep the blank starter."
      @select="applyTemplate"
      @blank="applyBlank"
    />

    <!-- Share modal -->
    <div v-if="shareOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/30" @click.self="shareOpen = false">
      <div class="pc-card p-5 w-[440px] max-w-[calc(100vw-2rem)] space-y-4">
        <div class="flex items-center justify-between">
          <div class="font-medium flex items-center gap-2">
            <UIcon name="i-lucide-share-2" class="size-4 text-primary-500" /> Share this email
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Close" @click="shareOpen = false" />
        </div>

        <div class="space-y-2">
          <button
            v-for="m in shareModes"
            :key="m.value"
            type="button"
            class="w-full rounded-lg border p-3 text-left transition"
            :class="shareMode === m.value ? 'border-primary-500 bg-primary-500/5' : 'pc-hairline hover:border-primary-500/40'"
            :disabled="shareBusy"
            @click="setShareMode(m.value as 'off' | 'view' | 'edit')"
          >
            <div class="text-sm font-medium">{{ m.label }}</div>
            <div class="text-xs pc-dim mt-0.5">{{ m.description }}</div>
          </button>
        </div>

        <div v-if="shareUrl" class="flex items-center gap-2">
          <UInput :model-value="shareUrl" readonly class="flex-1" size="sm" />
          <UButton icon="i-lucide-copy" size="sm" color="neutral" variant="subtle" @click="copyShareUrl">Copy</UButton>
        </div>
        <p v-if="shareMode === 'edit'" class="text-xs pc-dim">
          Collaborators open the same link; signed-in users can edit and changes sync live to everyone.
        </p>
      </div>
    </div>
  </div>
</template>
