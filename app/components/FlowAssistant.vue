<script setup lang="ts">
import type { Connection, FlowStep, FlowTrigger, IntegrationMeta } from '~/types'

/**
 * AI-assisted flow authoring. Drives a chat against /api/flows/assist using a
 * saved "ai" connection. The model either asks clarifying questions or proposes
 * a full flow; on "Use this flow" we emit `apply` so the FlowBuilder fills the
 * same name/trigger/steps the manual builder edits.
 *
 * If the user has no AI connection yet, we render the AI integration's own
 * connectionSchema inline (with Test + Save, reusing the connections API) so
 * they can set one up without leaving the page.
 */
const props = defineProps<{
  catalog: IntegrationMeta[]
  connections: Connection[]
}>()
const emit = defineEmits<{
  apply: [{ name: string, description: string, trigger: FlowTrigger, steps: FlowStep[] }]
  /** a connection was created here; parent should refresh its list */
  connectionCreated: []
}>()

const toast = useToast()

const aiMeta = computed<IntegrationMeta | undefined>(() => props.catalog.find(i => i.id === 'ai'))
const aiConnections = computed(() => props.connections.filter(c => c.integrationId === 'ai'))
const hasAiConnection = computed(() => aiConnections.value.length > 0)

// ── connection / model picker ───────────────────────────────────────────────
const selectedConnId = ref<string>('')
watchEffect(() => {
  if (!selectedConnId.value && aiConnections.value.length) {
    const def = aiConnections.value.find(c => c.config?.defaultForAssist === true)
    selectedConnId.value = (def ?? aiConnections.value[0])!.id
  }
})
const selectedConn = computed(() => aiConnections.value.find(c => c.id === selectedConnId.value))
const connItems = computed(() =>
  aiConnections.value.map(c => ({
    label: c.config?.defaultModel ? `${c.name} · ${c.config.defaultModel}` : c.name,
    value: c.id
  }))
)
// optional model override (defaults to the connection's defaultModel server-side)
const modelOverride = ref('')

// ── inline connector setup (shown when no ai connection exists) ──────────────
const setupConfig = ref<Record<string, unknown>>({})
const setupName = ref('AI')
const testing = ref(false)
const testResult = ref<{ ok: boolean, message: string } | null>(null)
const savingConn = ref(false)

watch(() => aiMeta.value, (meta) => {
  if (meta && !Object.keys(setupConfig.value).length) {
    // seed defaults from the schema
    const seed: Record<string, unknown> = {}
    for (const f of meta.connectionSchema) if (f.default !== undefined) seed[f.key] = f.default
    setupConfig.value = seed
  }
}, { immediate: true })
watch(setupConfig, () => {
  testResult.value = null
}, { deep: true })

async function testSetup() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await $fetch('/api/connections/test', {
      method: 'POST',
      body: { integrationId: 'ai', config: setupConfig.value }
    })
  } catch (e: unknown) {
    testResult.value = { ok: false, message: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Test failed' }
  } finally {
    testing.value = false
  }
}

async function saveSetup() {
  if (!setupName.value.trim()) {
    toast.add({ title: 'Name your AI connection', color: 'warning' })
    return
  }
  savingConn.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/connections', {
      method: 'POST',
      body: { integrationId: 'ai', name: setupName.value.trim(), config: setupConfig.value }
    })
    toast.add({ title: 'AI connection saved', color: 'success' })
    emit('connectionCreated')
    // select it once the parent's list refreshes
    selectedConnId.value = res.id
  } catch (e: unknown) {
    toast.add({ title: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not save', color: 'error' })
  } finally {
    savingConn.value = false
  }
}

// ── chat ─────────────────────────────────────────────────────────────────────
// Shape matches what UChatMessages/UChatMessage expect (id, role, parts) so the
// presentational components render correctly without the AI SDK; we read the
// text back out of parts[0] when posting to the server.
interface UiMessage { id: string, role: 'user' | 'assistant', parts: Array<{ type: 'text', text: string }> }
interface AssistQuestionOption { label: string, value: string | number }
interface AssistQuestion {
  id: string
  label: string
  kind: 'select'
  options: AssistQuestionOption[]
  required?: boolean
  help?: string
}
const messages = ref<UiMessage[]>([])
const input = ref('')
const sending = ref(false)
let msgCounter = 0
const nextId = () => `m${++msgCounter}`
function pushMsg(role: 'user' | 'assistant', text: string) {
  messages.value.push({ id: nextId(), role, parts: [{ type: 'text', text }] })
}
const status = computed(() => (sending.value ? 'submitted' : 'ready') as 'submitted' | 'ready')

// the latest proposed flow awaiting the user's approval
const proposal = ref<{ name: string, description: string, summary: string, trigger: FlowTrigger, steps: FlowStep[] } | null>(null)
const pendingQuestions = ref<AssistQuestion[]>([])
const questionAnswers = ref<Record<string, string | number | undefined>>({})

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  await submitTurn(text)
}

async function submitTurn(text: string) {
  if (!selectedConn.value) {
    toast.add({ title: 'Pick an AI connection first', color: 'warning' })
    return
  }
  pushMsg('user', text)
  input.value = ''
  proposal.value = null
  pendingQuestions.value = []
  questionAnswers.value = {}
  sending.value = true
  try {
    const res = await $fetch<
      | { kind: 'questions', reply: string, questions: Array<string | AssistQuestion> }
      | { kind: 'flow', reply: string, summary: string, flow: { name: string, description: string, trigger: FlowTrigger, steps: FlowStep[] } }
      | { kind: 'error', reply: string }
    >('/api/flows/assist', {
      method: 'POST',
      body: {
        messages: messages.value.map(m => ({ role: m.role, content: m.parts[0]?.text ?? '' })),
        connectionId: selectedConn.value.id,
        model: modelOverride.value.trim() || undefined
      }
    })

    if (res.kind === 'questions') {
      const textQuestions = res.questions.filter((q): q is string => typeof q === 'string')
      const choiceQuestions = res.questions.filter((q): q is AssistQuestion => typeof q !== 'string')
      pushMsg('assistant', [
        res.reply,
        ...textQuestions.map(q => `• ${q}`),
        ...choiceQuestions.map(q => `• ${q.label}`)
      ].filter(Boolean).join('\n'))
      setPendingQuestions(choiceQuestions)
    } else if (res.kind === 'flow') {
      proposal.value = { ...res.flow, summary: res.summary }
      pushMsg('assistant', [res.reply, res.summary].filter(Boolean).join('\n\n') || 'Here’s a flow you can review.')
    } else {
      pushMsg('assistant', res.reply)
    }
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'The assistant request failed'
    pushMsg('assistant', `⚠️ ${msg}`)
  } finally {
    sending.value = false
  }
}

function setPendingQuestions(questions: AssistQuestion[]) {
  pendingQuestions.value = questions.map((q, index) => ({
    ...q,
    id: `${q.id || 'choice'}-${index}`
  }))
  const next: Record<string, string | number | undefined> = {}
  for (const q of pendingQuestions.value) {
    if (q.options.length === 1) next[q.id] = q.options[0]!.value
  }
  questionAnswers.value = next
}

function optionLabel(question: AssistQuestion, value: unknown): string {
  const found = question.options.find(o => o.value === value)
  return found ? found.label : String(value ?? '')
}

function questionItems(question: AssistQuestion) {
  return question.options.map(o => ({ label: o.label, value: o.value }))
}

async function submitQuestionAnswers() {
  const missing = pendingQuestions.value.find(q => q.required !== false && questionAnswers.value[q.id] == null)
  if (missing) {
    toast.add({ title: `Choose ${missing.label}`, color: 'warning' })
    return
  }

  const lines = pendingQuestions.value
    .map((q) => {
      const value = questionAnswers.value[q.id]
      if (value == null) return ''
      return `- ${q.label}: ${optionLabel(q, value)} (${value})`
    })
    .filter(Boolean)
  if (!lines.length) return

  await submitTurn(`Answers:\n${lines.join('\n')}`)
}

// the chat components type parts as the AI-SDK union; we only ever emit text
// parts, so narrow safely for rendering.
function partText(part: unknown): string {
  return (part && typeof part === 'object' && (part as { type?: string }).type === 'text')
    ? String((part as { text?: unknown }).text ?? '')
    : ''
}

function applyProposal() {
  if (!proposal.value) return
  emit('apply', {
    name: proposal.value.name,
    description: proposal.value.description,
    trigger: proposal.value.trigger,
    steps: proposal.value.steps
  })
}

function stepSummary(s: FlowStep): string {
  if (s.type === 'action') {
    const integ = props.catalog.find(i => i.id === s.integrationId)
    const action = integ?.actions.find(a => a.id === s.actionId)
    return `${integ?.name ?? s.integrationId}: ${action?.name ?? s.actionId}`
  }
  if (s.type === 'condition') return 'Only continue if…'
  if (s.type === 'forEach') return 'Repeat for each item'
  return 'Remember / cooldown'
}
</script>

<template>
  <div class="space-y-4">
    <!-- no AI connector yet: inline setup -->
    <template v-if="!hasAiConnection">
      <UAlert
        color="info"
        variant="soft"
        icon="i-lucide-sparkles"
        title="Set up an AI connector to use the assistant"
        description="Connect OpenAI, Anthropic, a local model (LM Studio), or any compatible endpoint. It stays on this server."
      />
      <UCard v-if="aiMeta">
        <div class="space-y-4">
          <UFormField
            label="Connection name"
            required
          >
            <UInput
              v-model="setupName"
              class="w-full"
              placeholder="e.g. OpenAI"
            />
          </UFormField>

          <SchemaForm
            :model-value="setupConfig"
            :schema="aiMeta.connectionSchema"
            @update:model-value="setupConfig = $event"
          />

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="Test"
              color="neutral"
              variant="soft"
              icon="i-lucide-plug-zap"
              :loading="testing"
              @click="testSetup"
            />
            <UButton
              label="Save & start"
              icon="i-lucide-check"
              :loading="savingConn"
              @click="saveSetup"
            />
            <span
              v-if="testResult"
              class="text-sm"
              :class="testResult.ok ? 'text-success' : 'text-error'"
            >
              <UIcon
                :name="testResult.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
                class="mr-1 inline size-4 align-text-bottom"
              />{{ testResult.message }}
            </span>
          </div>
        </div>
      </UCard>
    </template>

    <!-- chat -->
    <template v-else>
      <div
        v-if="messages.length === 0"
        class="rounded-xl border border-dashed border-default px-4 py-10 text-center"
      >
        <UIcon
          name="i-lucide-sparkles"
          class="mx-auto mb-3 size-7 text-primary"
        />
        <p class="font-medium text-highlighted">
          Describe the flow you want
        </p>
        <p class="mx-auto mt-1 max-w-md text-sm text-muted">
          e.g. “When my Dokploy server’s disk goes over 90%, send me a Telegram message.”
          I’ll ask anything I need, then build it for you to review.
        </p>
      </div>

      <UChatMessages
        v-else
        :messages="messages"
        :status="status"
        :should-scroll-to-bottom="false"
        :assistant="{ side: 'left', variant: 'naked', avatar: { icon: 'i-lucide-sparkles' } }"
      >
        <template #content="{ message }">
          <p
            v-for="(part, i) in message.parts"
            :key="i"
            class="whitespace-pre-wrap"
          >
            {{ partText(part) }}
          </p>
        </template>
      </UChatMessages>

      <!-- proposed flow card -->
      <UCard
        v-if="proposal"
        :ui="{ root: 'ring-primary/40' }"
      >
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-workflow"
              class="size-4 text-primary"
            />
            <span class="font-medium text-highlighted">{{ proposal.name }}</span>
          </div>
          <p
            v-if="proposal.description"
            class="text-sm text-muted"
          >
            {{ proposal.description }}
          </p>
          <ol class="space-y-1 text-sm">
            <li
              v-for="(s, i) in proposal.steps"
              :key="s.id"
              class="flex items-center gap-2 text-muted"
            >
              <span class="font-mono text-xs text-dimmed">{{ i + 1 }}.</span>
              {{ stepSummary(s) }}
            </li>
          </ol>
          <div class="flex justify-end gap-2 pt-1">
            <UButton
              label="Use this flow"
              icon="i-lucide-check"
              @click="applyProposal"
            />
          </div>
          <p class="text-xs text-dimmed">
            You’ll be able to review and tweak every step before saving.
          </p>
        </div>
      </UCard>

      <UCard
        v-if="pendingQuestions.length"
        :ui="{ root: 'ring-info/30' }"
      >
        <div class="space-y-4">
          <div class="flex items-start gap-2">
            <UIcon
              name="i-lucide-list-checks"
              class="mt-0.5 size-4 text-info"
            />
            <div>
              <p class="text-sm font-medium text-highlighted">
                Pick from what I found
              </p>
              <p class="text-xs text-muted">
                These options are discovered from your saved connections, so you do not have to hunt for IDs.
              </p>
            </div>
          </div>

          <UFormField
            v-for="q in pendingQuestions"
            :key="q.id"
            :label="q.label"
            :required="q.required !== false"
            :description="q.help"
          >
            <USelect
              v-model="questionAnswers[q.id]"
              :items="questionItems(q)"
              placeholder="Choose an option"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end">
            <UButton
              label="Continue"
              icon="i-lucide-arrow-right"
              :loading="sending"
              @click="submitQuestionAnswers"
            />
          </div>
        </div>
      </UCard>

      <UChatPrompt
        v-model="input"
        :loading="sending"
        placeholder="Describe what you want to automate…"
        @submit="send"
      >
        <UChatPromptSubmit color="neutral" />
        <template #footer>
          <div class="flex w-full items-center gap-2">
            <USelect
              v-model="selectedConnId"
              :items="connItems"
              size="sm"
              variant="ghost"
              icon="i-lucide-sparkles"
            />
            <UInput
              v-model="modelOverride"
              size="sm"
              variant="ghost"
              :placeholder="(selectedConn?.config?.defaultModel as string) || 'model'"
            />
          </div>
        </template>
      </UChatPrompt>
    </template>
  </div>
</template>
