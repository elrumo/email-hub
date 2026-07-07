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

import { lintEmailDocument } from '#shared/email/lint'

import EmailPreview from '~/components/email/EmailPreview.vue'
import EmailInspector from '~/components/email/EmailInspector.vue'
import EmailVariables from '~/components/email/EmailVariables.vue'
import EmailTemplatePicker from '~/components/email/EmailTemplatePicker.vue'
import EmailReview from '~/components/email/EmailReview.vue'

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
const canEdit = computed(() => access.value !== 'view')

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
const rightTab = ref<'design' | 'variables' | 'review'>('design')

// Live lint count for the Review tab badge.
const reviewIssueCount = computed(() => lintEmailDocument(document.value).length)

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
    // Keep variables reconciled with what the server stored.
    variables.value = res.project.variables
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

// ---- undo / redo ------------------------------------------------------------
// A snapshot stack over the whole document. Edits within a short burst
// (typing) coalesce into one step; remote live-sync updates and undo/redo
// applications reset the baseline without recording a step.
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const HISTORY_LIMIT = 100
const HISTORY_COALESCE_MS = 900
let lastSnapshot = JSON.stringify(document.value)
let lastEditAt = 0
let skipHistoryOnce = false

watch(document, () => {
  const json = JSON.stringify(document.value)
  if (json === lastSnapshot) return
  if (skipHistoryOnce) {
    skipHistoryOnce = false
    lastSnapshot = json
    lastEditAt = 0
    return
  }
  const now = Date.now()
  if (now - lastEditAt > HISTORY_COALESCE_MS) {
    undoStack.value.push(lastSnapshot)
    if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
    redoStack.value = []
  }
  lastEditAt = now
  lastSnapshot = json
}, { deep: true })

function undo() {
  if (!undoStack.value.length || access.value === 'view') return
  redoStack.value.push(JSON.stringify(document.value))
  const prev = undoStack.value.pop()!
  skipHistoryOnce = true
  document.value = JSON.parse(prev) as EmailDocument
  selectedId.value = null
}

function redo() {
  if (!redoStack.value.length || access.value === 'view') return
  undoStack.value.push(JSON.stringify(document.value))
  const next = redoStack.value.pop()!
  skipHistoryOnce = true
  document.value = JSON.parse(next) as EmailDocument
  selectedId.value = null
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

function onKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (!mod || isEditableTarget(e.target)) return
  if (e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if (e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redo()
  }
}

// ---- live multiplayer sync --------------------------------------------------
// Every open tab of this email streams document updates (SSE backed by Parse
// Live Queries). Saves from other collaborators appear in place.
let liveSource: EventSource | null = null
onMounted(() => {
  actorId.value = crypto.randomUUID()
  window.addEventListener('keydown', onKeydown)
  liveSource = new EventSource(`/api/emails/${id}/events${apiSuffix}`)
  liveSource.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data) as { document?: EmailDocument, variables?: TemplateVariable[], name?: string, actorId?: string | null }
      if (!payload?.document || payload.actorId === actorId.value) return
      skipNextSave = true
      // Remote edits reset the local undo baseline instead of becoming a step.
      skipHistoryOnce = true
      document.value = payload.document
      if (payload.variables) variables.value = payload.variables
      if (payload.name) name.value = payload.name
    } catch { /* malformed frame — ignore */ }
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  liveSource?.close()
})

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

// ---- version history --------------------------------------------------------
interface VersionMeta {
  id: string
  name: string
  cause: string
  subject: string
  blockCount: number
  createdAt: number
}

const historyOpen = ref(false)
const historyLoading = ref(false)
const versions = ref<VersionMeta[]>([])
const restoringId = ref<string | null>(null)

const causeLabels: Record<string, { label: string, icon: string }> = {
  ai: { label: 'AI edit', icon: 'i-lucide-sparkles' },
  manual: { label: 'Checkpoint', icon: 'i-lucide-save' },
  restore: { label: 'Before restore', icon: 'i-lucide-history' }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

watch(historyOpen, async (open) => {
  if (!open) return
  historyLoading.value = true
  try {
    const res = await $fetch<{ versions: VersionMeta[] }>(`/api/emails/${id}/versions${apiSuffix}`)
    versions.value = res.versions
  } catch {
    toast.add({ title: 'Could not load version history.', color: 'error' })
  } finally {
    historyLoading.value = false
  }
})

async function restoreVersion(versionId: string) {
  restoringId.value = versionId
  try {
    const res = await $fetch<{ project: { name: string, document: EmailDocument, variables: TemplateVariable[] } }>(
      `/api/emails/${id}/versions/${versionId}/restore${apiSuffix}`,
      { method: 'POST' }
    )
    // The server already persisted the restore; apply it locally as an
    // undoable edit but skip the redundant autosave round-trip.
    skipNextSave = true
    document.value = res.project.document
    variables.value = res.project.variables
    name.value = res.project.name
    selectedId.value = null
    historyOpen.value = false
    toast.add({ title: 'Version restored', icon: 'i-lucide-history', color: 'success' })
  } catch (e: any) {
    toast.add({ title: e?.data?.statusMessage || 'Could not restore that version.', color: 'error' })
  } finally {
    restoringId.value = null
  }
}

// ---- send a test email ------------------------------------------------------
const { user } = useAuth()
const testOpen = ref(false)
const testTo = ref('')
const testSending = ref(false)

watch(testOpen, (open) => {
  if (open && !testTo.value) testTo.value = user.value?.email ?? ''
})

async function sendTest() {
  const to = testTo.value.trim()
  if (!to || testSending.value) return
  testSending.value = true
  try {
    const res = await $fetch<{ delivered: boolean, to: string }>(`/api/emails/${id}/send-test${apiSuffix}`, {
      method: 'POST',
      body: { to, document: document.value }
    })
    testOpen.value = false
    toast.add(res.delivered
      ? { title: `Test sent to ${res.to}`, icon: 'i-lucide-mail-check', color: 'success' }
      : { title: 'SMTP isn\'t configured', description: 'The send was logged on the server instead of delivered.', icon: 'i-lucide-mail-warning', color: 'warning' })
  } catch (e: any) {
    toast.add({ title: e?.data?.statusMessage || 'Could not send the test email.', color: 'error' })
  } finally {
    testSending.value = false
  }
}

// ---- save as template -------------------------------------------------------
const saveTplOpen = ref(false)
const tplName = ref('')
const tplDescription = ref('')
const tplSaving = ref(false)

watch(saveTplOpen, (open) => {
  if (open && !tplName.value) tplName.value = name.value
})

async function saveAsTemplate() {
  if (!tplName.value.trim() || tplSaving.value) return
  tplSaving.value = true
  try {
    await $fetch('/api/templates', {
      method: 'POST',
      body: { name: tplName.value, description: tplDescription.value, document: document.value }
    })
    saveTplOpen.value = false
    toast.add({ title: 'Saved as template', description: 'Find it under “Your templates” when starting an email.', icon: 'i-lucide-bookmark-check', color: 'success' })
  } catch (e: any) {
    toast.add({ title: e?.data?.statusMessage || 'Could not save the template.', color: 'error' })
  } finally {
    tplSaving.value = false
  }
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
        ...(reviewIssueCount.value
          ? [{ label: `Fix ${reviewIssueCount.value} issue${reviewIssueCount.value === 1 ? '' : 's'}`, prompt: 'Fix all outstanding review findings listed in your context. Keep the layout and intent; only fix the problems, and summarize what you fixed.' }]
          : []),
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
  document.value = payload.document
  name.value = payload.template.name
  selectedId.value = null
  templateOpen.value = false
  toast.add({ title: `Applied “${payload.template.name}”`, color: 'success' })
}
function applyBlank(next: EmailDocument) {
  document.value = next
  selectedId.value = null
  templateOpen.value = false
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

function downloadHtml() {
  const html = renderEmailHtml(document.value)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = `${(name.value || 'email').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'email'}.html`
  a.click()
  URL.revokeObjectURL(url)
}

const exportItems = computed(() => [[
  { label: 'Copy HTML', icon: 'i-lucide-clipboard-copy', onSelect: copyHtml },
  { label: 'Download .html', icon: 'i-lucide-download', onSelect: downloadHtml }
]])

const moreItems = computed(() => {
  const items: Array<{ label: string, icon: string, onSelect: () => void }> = []
  if (canEdit.value) items.push({ label: 'Send test email…', icon: 'i-lucide-mail-check', onSelect: () => (testOpen.value = true) })
  if (user.value) items.push({ label: 'Save as template…', icon: 'i-lucide-bookmark-plus', onSelect: () => (saveTplOpen.value = true) })
  if (canEdit.value) items.push({ label: 'Version history…', icon: 'i-lucide-history', onSelect: () => (historyOpen.value = true) })
  return [items]
})

function applySavedTemplate(payload: { name: string, document: EmailDocument }) {
  document.value = payload.document
  name.value = payload.name
  selectedId.value = null
  templateOpen.value = false
  toast.add({ title: `Applied “${payload.name}”`, color: 'success' })
}

/** Review tab → "Fix with AI": hand the finding to the chat. */
function fixWithAi(prompt: string) {
  if (!isOwner.value || busyChat.value) return
  chat.sendMessage({ text: prompt })
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
        <template v-if="canEdit">
          <UButton
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Undo"
            :disabled="!undoStack.length"
            @click="undo"
          />
          <UButton
            icon="i-lucide-redo-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Redo"
            :disabled="!redoStack.length"
            @click="redo"
          />
        </template>
        <UDropdownMenu :items="addItems">
          <UButton icon="i-lucide-plus" label="Add" color="neutral" variant="ghost" size="xs" :ui="{ label: 'hidden sm:inline' }" />
        </UDropdownMenu>
        <UButton icon="i-lucide-layout-template" color="neutral" variant="ghost" size="xs" aria-label="Templates" @click="templateOpen = true" />
        <UDropdownMenu v-if="moreItems[0]?.length" :items="moreItems">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="xs" aria-label="More actions" />
        </UDropdownMenu>
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
        <UDropdownMenu :items="exportItems">
          <UButton icon="i-lucide-code-xml" label="Export" size="xs" :ui="{ label: 'hidden sm:inline' }" />
        </UDropdownMenu>
      </div>

      <!-- 3 panes -->
      <div class="min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_320px]">
        <!-- AI chat (owner) / collaborator note -->
        <aside v-if="!isOwner" class="hidden lg:flex h-full min-h-0 flex-col border-r pc-hairline pc-sidebar-material">
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

        <aside v-else class="hidden lg:flex h-full min-h-0 flex-col border-r pc-hairline pc-sidebar-material">
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
        <main class="relative h-full min-h-0">
          <EmailPreview
            :document="previewDocument"
            :selected-id="selectedId"
            :device="previewDevice"
            @select="selectedId = $event"
            @move="onPreviewMove"
          />
          <!-- device switcher -->
          <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full pc-material border pc-hairline p-1 shadow-sm">
            <UButton
              v-for="d in previewDevices"
              :key="d.id"
              :icon="d.icon"
              size="xs"
              :color="previewDeviceId === d.id ? 'primary' : 'neutral'"
              :variant="previewDeviceId === d.id ? 'soft' : 'ghost'"
              :aria-label="`Preview on ${d.label}`"
              class="rounded-full"
              @click="previewDeviceId = d.id"
            />
          </div>
        </main>

        <!-- inspector / variables -->
        <aside class="hidden lg:flex h-full min-h-0 flex-col border-l pc-hairline">
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
            <UButton
              icon="i-lucide-scan-search"
              size="xs"
              class="flex-1 justify-center"
              :color="rightTab === 'review' ? 'primary' : 'neutral'"
              :variant="rightTab === 'review' ? 'soft' : 'ghost'"
              @click="rightTab = 'review'"
            >
              Review
              <UBadge
                v-if="reviewIssueCount"
                :label="String(reviewIssueCount)"
                color="warning"
                variant="soft"
                size="sm"
              />
            </UButton>
          </div>

          <div v-show="rightTab === 'design'" class="flex-1 min-h-0 flex flex-col">
            <EmailInspector
              :document="document"
              :selected-id="selectedId"
              :email-id="id"
              :can-ai="isOwner"
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

          <div v-show="rightTab === 'review'" class="flex-1 min-h-0">
            <EmailReview
              :document="document"
              :can-ai="isOwner"
              :ai-busy="busyChat"
              @select="(bid) => { selectedId = bid; rightTab = 'design' }"
              @fix="fixWithAi"
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
      @select-saved="applySavedTemplate"
      @blank="applyBlank"
    />

    <!-- Version history modal -->
    <div v-if="historyOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/30" @click.self="historyOpen = false">
      <div class="pc-card p-5 w-[480px] max-w-[calc(100vw-2rem)] space-y-4">
        <div class="flex items-center justify-between">
          <div class="font-medium flex items-center gap-2">
            <UIcon name="i-lucide-history" class="size-4 text-primary-500" /> Version history
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Close" @click="historyOpen = false" />
        </div>

        <div v-if="historyLoading" class="flex items-center justify-center py-10">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin pc-dim" />
        </div>
        <p v-else-if="!versions.length" class="py-8 text-center text-sm pc-dim">
          No versions yet — snapshots are taken automatically as you and the AI edit.
        </p>
        <ul v-else class="max-h-[50vh] space-y-2 overflow-y-auto pc-scroll pr-1">
          <li
            v-for="v in versions"
            :key="v.id"
            class="flex items-center gap-3 rounded-lg border pc-hairline p-3"
          >
            <UIcon :name="causeLabels[v.cause]?.icon ?? 'i-lucide-save'" class="size-4 shrink-0 text-primary-500" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ v.subject || v.name }}</span>
                <UBadge :label="causeLabels[v.cause]?.label ?? v.cause" color="neutral" variant="soft" size="sm" />
              </div>
              <div class="mt-0.5 text-xs pc-dim">{{ relativeTime(v.createdAt) }} · {{ v.blockCount }} block{{ v.blockCount === 1 ? '' : 's' }}</div>
            </div>
            <UButton
              label="Restore"
              size="xs"
              color="neutral"
              variant="subtle"
              :loading="restoringId === v.id"
              :disabled="!!restoringId"
              @click="restoreVersion(v.id)"
            />
          </li>
        </ul>
        <p class="text-xs pc-dim">Restoring snapshots the current state first, so you can always come back.</p>
      </div>
    </div>

    <!-- Send test modal -->
    <div v-if="testOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/30" @click.self="testOpen = false">
      <div class="pc-card p-5 w-[420px] max-w-[calc(100vw-2rem)] space-y-4">
        <div class="flex items-center justify-between">
          <div class="font-medium flex items-center gap-2">
            <UIcon name="i-lucide-mail-check" class="size-4 text-primary-500" /> Send a test email
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Close" @click="testOpen = false" />
        </div>
        <p class="text-xs pc-dim">Sends the current design with your sample variable values filled in, so you can check it in a real inbox.</p>
        <UFormField label="Send to">
          <UInput v-model="testTo" type="email" placeholder="you@example.com" class="w-full" @keydown.enter="sendTest" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="testOpen = false" />
          <UButton label="Send test" icon="i-lucide-send" size="sm" :loading="testSending" @click="sendTest" />
        </div>
      </div>
    </div>

    <!-- Save as template modal -->
    <div v-if="saveTplOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/30" @click.self="saveTplOpen = false">
      <div class="pc-card p-5 w-[420px] max-w-[calc(100vw-2rem)] space-y-4">
        <div class="flex items-center justify-between">
          <div class="font-medium flex items-center gap-2">
            <UIcon name="i-lucide-bookmark-plus" class="size-4 text-primary-500" /> Save as template
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Close" @click="saveTplOpen = false" />
        </div>
        <p class="text-xs pc-dim">Reuse this design as a starting point for future emails.</p>
        <UFormField label="Template name">
          <UInput v-model="tplName" placeholder="e.g. Monthly newsletter" class="w-full" />
        </UFormField>
        <UFormField label="Description (optional)">
          <UInput v-model="tplDescription" placeholder="What is this template for?" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="saveTplOpen = false" />
          <UButton label="Save template" icon="i-lucide-bookmark" size="sm" :loading="tplSaving" :disabled="!tplName.trim()" @click="saveAsTemplate" />
        </div>
      </div>
    </div>

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
