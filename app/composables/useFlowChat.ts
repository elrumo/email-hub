import type { Ref } from 'vue'
import type { Connection, FlowStep, FlowTrigger, IntegrationMeta } from '~/types'

/**
 * Shared state machine for the AI flow-building chat. Extracted from the old
 * FlowAssistant component so the same conversation can drive several
 * presentations: a floating dock on the builder pages and a Claude-style
 * launcher on the flow list.
 *
 * The chat talks to /api/flows/assist, which replies with either clarifying
 * questions or a proposed flow. Questions can be plain strings (open-ended,
 * rendered as text) or structured controls (select / multiselect / boolean /
 * text / number) that we render INLINE in the transcript as pre-filled,
 * ready-to-use inputs.
 */

export type AssistQuestionKind = 'select' | 'multiselect' | 'boolean' | 'text' | 'number'

export interface AssistQuestionOption { label: string, value: string | number }

export interface AssistQuestion {
  id: string
  label: string
  kind: AssistQuestionKind
  options: AssistQuestionOption[]
  required?: boolean
  help?: string
}

export interface ChatProposal {
  name: string
  description: string
  summary: string
  trigger: FlowTrigger
  steps: FlowStep[]
}

export type AnswerValue = string | number | Array<string | number> | undefined

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** structured controls rendered inline under an assistant turn */
  questions?: AssistQuestion[]
  /** local, per-message answer state bound to those controls */
  answers?: Record<string, AnswerValue>
  /** a proposed flow rendered inline as a preview card */
  proposal?: ChatProposal
  /** once a follow-up turn is sent, this turn's controls become read-only */
  answered?: boolean
}

interface AssistResponse {
  kind: 'questions' | 'flow' | 'error'
  reply: string
  summary?: string
  questions?: Array<string | AssistQuestion>
  flow?: { name: string, description: string, trigger: FlowTrigger, steps: FlowStep[] }
}

export interface FlowChatApplyPayload {
  name: string
  description: string
  trigger: FlowTrigger
  steps: FlowStep[]
}

export function useFlowChat(options: {
  catalog: Ref<IntegrationMeta[]>
  connections: Ref<Connection[]>
}) {
  const { catalog, connections } = options
  const toast = useToast()

  // ── connection / model picker ───────────────────────────────────────────────
  const aiMeta = computed<IntegrationMeta | undefined>(() => catalog.value.find(i => i.id === 'ai'))
  const aiConnections = computed(() => connections.value.filter(c => c.integrationId === 'ai'))
  const hasAiConnection = computed(() => aiConnections.value.length > 0)

  const selectedConnId = ref('')
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
  const modelOverride = ref('')

  // ── inline connector setup (when no ai connection exists yet) ────────────────
  const setupConfig = ref<Record<string, unknown>>({})
  const setupName = ref('AI')
  const testing = ref(false)
  const testResult = ref<{ ok: boolean, message: string } | null>(null)
  const savingConn = ref(false)

  watch(aiMeta, (meta) => {
    if (meta && !Object.keys(setupConfig.value).length) {
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
      // refresh the shared connections list so every consumer (and the picker)
      // sees it, then select it.
      await refreshNuxtData('connections')
      selectedConnId.value = res.id
    } catch (e: unknown) {
      toast.add({ title: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not save', color: 'error' })
    } finally {
      savingConn.value = false
    }
  }

  // ── chat transcript ──────────────────────────────────────────────────────────
  const messages = ref<ChatMessage[]>([])
  const input = ref('')
  const sending = ref(false)
  let counter = 0
  const nextId = () => `m${++counter}`
  const status = computed(() => (sending.value ? 'submitted' : 'ready') as 'submitted' | 'ready')
  const started = computed(() => messages.value.length > 0)

  function coerceQuestion(raw: AssistQuestion): AssistQuestion {
    const kind: AssistQuestionKind = raw.kind ?? (raw.options?.length ? 'select' : 'text')
    let options = Array.isArray(raw.options) ? raw.options : []
    if (kind === 'boolean' && !options.length) {
      options = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]
    }
    return { ...raw, kind, options }
  }

  function defaultAnswers(questions: AssistQuestion[]): Record<string, AnswerValue> {
    const next: Record<string, AnswerValue> = {}
    for (const q of questions) {
      if (q.kind === 'multiselect') next[q.id] = []
      else if (q.options.length === 1) next[q.id] = q.options[0]!.value
    }
    return next
  }

  async function send(text?: string) {
    const content = (text ?? input.value).trim()
    if (!content || sending.value) return
    if (!selectedConn.value) {
      toast.add({ title: 'Pick an AI connection first', color: 'warning' })
      return
    }

    // lock any earlier interactive turns so only the latest one is editable
    for (const m of messages.value) m.answered = true

    messages.value.push({ id: nextId(), role: 'user', text: content })
    input.value = ''
    sending.value = true

    try {
      const res = await $fetch<AssistResponse>('/api/flows/assist', {
        method: 'POST',
        body: {
          messages: messages.value.map(m => ({ role: m.role, content: m.text })),
          connectionId: selectedConn.value.id,
          model: modelOverride.value.trim() || undefined
        }
      })

      if (res.kind === 'questions') {
        const raw = res.questions ?? []
        const textQuestions = raw.filter((q): q is string => typeof q === 'string')
        const controls = raw
          .filter((q): q is AssistQuestion => typeof q !== 'string')
          .map((q, i) => {
            const coerced = coerceQuestion(q)
            return { ...coerced, id: `${coerced.id || 'choice'}-${messages.value.length}-${i}` }
          })
        messages.value.push({
          id: nextId(),
          role: 'assistant',
          text: [res.reply, ...textQuestions.map(q => `• ${q}`)].filter(Boolean).join('\n') || 'A couple of questions:',
          questions: controls.length ? controls : undefined,
          answers: controls.length ? defaultAnswers(controls) : undefined
        })
      } else if (res.kind === 'flow' && res.flow) {
        messages.value.push({
          id: nextId(),
          role: 'assistant',
          text: [res.reply, res.summary].filter(Boolean).join('\n\n') || 'Here’s a flow you can review.',
          proposal: { ...res.flow, summary: res.summary ?? '' }
        })
      } else {
        messages.value.push({ id: nextId(), role: 'assistant', text: res.reply || 'I didn’t catch that — try rephrasing.' })
      }
    } catch (e: unknown) {
      const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'The assistant request failed'
      messages.value.push({ id: nextId(), role: 'assistant', text: `⚠️ ${msg}` })
    } finally {
      sending.value = false
    }
  }

  function optionLabel(q: AssistQuestion, value: unknown): string {
    const found = q.options.find(o => o.value === value)
    return found ? found.label : String(value ?? '')
  }

  function isAnswered(q: AssistQuestion, value: AnswerValue): boolean {
    if (q.kind === 'multiselect') return Array.isArray(value) && value.length > 0
    return value !== undefined && value !== '' && value !== null
  }

  function answerLine(q: AssistQuestion, value: AnswerValue): string {
    if (q.kind === 'multiselect') {
      const arr = Array.isArray(value) ? value : []
      return `- ${q.label}: ${arr.map(v => `${optionLabel(q, v)} (${v})`).join(', ')}`
    }
    if (q.options.length) return `- ${q.label}: ${optionLabel(q, value)} (${value})`
    return `- ${q.label}: ${value}`
  }

  async function submitAnswers(message: ChatMessage) {
    const questions = message.questions ?? []
    const answers = message.answers ?? {}
    const missing = questions.find(q => q.required !== false && !isAnswered(q, answers[q.id]))
    if (missing) {
      toast.add({ title: `Answer “${missing.label}”`, color: 'warning' })
      return
    }
    const lines = questions
      .filter(q => isAnswered(q, answers[q.id]))
      .map(q => answerLine(q, answers[q.id]))
    if (!lines.length) return
    await send(`Answers:\n${lines.join('\n')}`)
  }

  /** Quick single-control submit (e.g. a boolean Yes/No button). */
  async function submitSingle(message: ChatMessage, q: AssistQuestion, value: string | number) {
    if (!message.answers) message.answers = {}
    message.answers[q.id] = value
    await submitAnswers(message)
  }

  function stepSummary(s: FlowStep): string {
    if (s.type === 'action') {
      const integ = catalog.value.find(i => i.id === s.integrationId)
      const action = integ?.actions.find(a => a.id === s.actionId)
      return `${integ?.name ?? s.integrationId}: ${action?.name ?? s.actionId}`
    }
    if (s.type === 'condition') return 'Only continue if…'
    if (s.type === 'forEach') return 'Repeat for each item'
    return 'Remember / cooldown'
  }

  function reset() {
    messages.value = []
    input.value = ''
  }

  return {
    // connection picker
    aiMeta, aiConnections, hasAiConnection, selectedConnId, selectedConn, connItems, modelOverride,
    // inline setup
    setupConfig, setupName, testing, testResult, savingConn, testSetup, saveSetup,
    // chat
    messages, input, sending, status, started,
    send, submitAnswers, submitSingle, stepSummary, reset
  }
}
