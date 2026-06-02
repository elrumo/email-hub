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
import { addBlock, moveBlock } from '#shared/email/ops'
import { renderEmailHtml } from '#shared/email/render'
import { applyTemplateVariables } from '#shared/email/placeholders'
import { isStarterEmailDocument, type EmailTemplateDefinition } from '#shared/email/templates'
import type { TemplateVariable } from '~~/server/db/schema'

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
  project: { id: string, name: string, document: EmailDocument, variables: TemplateVariable[], updatedAt: number }
  messages: Array<{ id: string, role: string, parts: UIMessage['parts'] }>
}

const { data, error } = await useFetch<ProjectResponse>(`/api/projects/${id}`, { key: `project-${id}` })
if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Email project not found' })
}

// ---- shared state ---------------------------------------------------------
const document = ref<EmailDocument>(data.value.project.document)
const variables = ref<TemplateVariable[]>(data.value.project.variables ?? [])
const name = ref(data.value.project.name)
const selectedId = ref<string | null>(null)
const input = ref('')
const templateOpen = ref(false)
const rightTab = ref<'design' | 'variables'>('design')

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
const saveDoc = useDebounceFn(async () => {
  saving.value = true
  try {
    const res = await $fetch<{ project: { variables: TemplateVariable[] } }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: { document: document.value, name: name.value, variables: variables.value }
    })
    // Keep variables reconciled with what the server stored.
    variables.value = res.project.variables
  } catch {
    toast.add({ title: 'Autosave failed', color: 'error' })
  } finally {
    saving.value = false
  }
}, 800)
watch([document, name, variables], saveDoc, { deep: true })

// ---- AI chat --------------------------------------------------------------
const chat = new Chat<UIMessage>({
  messages: (data.value.messages ?? []) as UIMessage[],
  transport: new DefaultChatTransport({
    api: `/api/projects/${id}/chat`,
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

const promptPlaceholder = computed(() => {
  const b = selectedId.value ? document.value.blocks.find(x => x.id === selectedId.value) : null
  return b ? `Ask Postcard AI to change the selected ${b.type}…` : 'Describe the email you want, or ask for a change…'
})

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
        <UButton to="/app" color="neutral" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
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
        <UDropdownMenu :items="addItems">
          <UButton icon="i-lucide-plus" label="Add" color="neutral" variant="ghost" size="xs" :ui="{ label: 'hidden sm:inline' }" />
        </UDropdownMenu>
        <UButton icon="i-lucide-layout-template" color="neutral" variant="ghost" size="xs" aria-label="Templates" @click="templateOpen = true" />
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
        <!-- AI chat -->
        <aside class="hidden lg:flex h-full min-h-0 flex-col border-r pc-hairline pc-sidebar-material">
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

          <div class="border-t pc-hairline p-3">
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
  </div>
</template>
