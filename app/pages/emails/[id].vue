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
import { addBlock } from '#shared/email/ops'
import { renderEmailHtml } from '#shared/email/render'

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
const previewMode = ref<'desktop' | 'mobile'>('desktop')
const input = ref('')

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
  ]
]
function insert(type: EmailBlockType) {
  const res = addBlock(document.value, type)
  document.value = res.doc
  selectedId.value = res.id
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

useHead({ title: () => `${name.value} · Email designer` })
</script>

<template>
  <div class="flex h-dvh flex-col bg-default">
    <!-- top bar -->
    <header class="flex items-center gap-3 border-b border-default px-4 py-2.5">
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
      <span class="flex items-center gap-1.5 text-xs text-dimmed">
        <UIcon
          :name="saving ? 'i-lucide-loader-circle' : 'i-lucide-check'"
          :class="saving ? 'animate-spin' : 'text-success'"
          class="size-3.5"
        />
        {{ saving ? 'Saving…' : 'Saved' }}
      </span>

      <UFieldGroup>
        <UButton
          icon="i-lucide-monitor"
          size="sm"
          :color="previewMode === 'desktop' ? 'primary' : 'neutral'"
          :variant="previewMode === 'desktop' ? 'soft' : 'ghost'"
          aria-label="Desktop preview"
          @click="previewMode = 'desktop'"
        />
        <UButton
          icon="i-lucide-smartphone"
          size="sm"
          :color="previewMode === 'mobile' ? 'primary' : 'neutral'"
          :variant="previewMode === 'mobile' ? 'soft' : 'ghost'"
          aria-label="Mobile preview"
          @click="previewMode = 'mobile'"
        />
      </UFieldGroup>

      <UDropdownMenu :items="addItems">
        <UButton
          icon="i-lucide-plus"
          label="Add block"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </UDropdownMenu>

      <UButton
        icon="i-lucide-code-xml"
        label="Copy HTML"
        size="sm"
        @click="copyHtml"
      />
    </header>

    <!-- 3-pane body -->
    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_1fr_300px]">
      <!-- chat -->
      <aside class="flex min-h-0 flex-col border-r border-default">
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
        </div>

        <UChatMessages
          v-else
          :messages="chat.messages"
          :status="chat.status"
          :assistant="{ avatar: { icon: 'i-lucide-sparkles' } }"
          class="min-h-0 flex-1 py-4"
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
      <main class="min-h-0">
        <EmailEmailPreview
          :document="document"
          :selected-id="selectedId"
          :mode="previewMode"
          @select="selectedId = $event"
        />
      </main>

      <!-- inspector -->
      <aside class="hidden min-h-0 flex-col border-l border-default lg:flex">
        <EmailEmailInspector
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
          <ul class="max-h-48 overflow-y-auto pb-2">
            <li
              v-for="b in document.blocks"
              :key="b.id"
            >
              <button
                class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm transition hover:bg-elevated/60"
                :class="selectedId === b.id ? 'bg-primary/10 text-primary' : 'text-muted'"
                @click="selectedId = b.id"
              >
                <UIcon
                  name="i-lucide-grip-vertical"
                  class="size-3.5 text-dimmed"
                />
                <span class="truncate">{{ blockLabel(b) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>
