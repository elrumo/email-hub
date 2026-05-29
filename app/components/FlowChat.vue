<script setup lang="ts">
import type { Connection, IntegrationMeta } from '~/types'
import type { ChatMessage, FlowChatApplyPayload } from '~/composables/useFlowChat'

/**
 * Containerized AI flow-building chat. Renders the whole conversation —
 * including the dynamic, pre-filled controls the assistant asks for (monitor
 * pickers, conditions, yes/no, free text) inline in the transcript, and a flow
 * preview card with "Use this flow". Layout-agnostic (fills its parent), so it
 * can sit inside the floating dock or any other shell.
 */
const props = defineProps<{
  catalog: IntegrationMeta[]
  connections: Connection[]
  /** auto-sent once the chat is ready (used by the list launcher) */
  initialPrompt?: string
}>()
const emit = defineEmits<{ apply: [FlowChatApplyPayload] }>()

const {
  aiMeta, hasAiConnection, selectedConnId, selectedConn, connItems, modelOverride,
  setupConfig, setupName, testing, testResult, savingConn, testSetup, saveSetup,
  messages, input, sending, started,
  send, submitAnswers, stepSummary
} = useFlowChat({ catalog: toRef(props, 'catalog'), connections: toRef(props, 'connections') })

// auto-scroll the transcript on new turns / while thinking
const listEl = ref<HTMLElement | null>(null)
watch([() => messages.value.length, sending], () => {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
})

// seed an opening prompt exactly once, when a connection is ready
const seeded = ref(false)
function maybeSeed() {
  if (seeded.value || !props.initialPrompt) return
  if (selectedConn.value) {
    seeded.value = true
    send(props.initialPrompt)
  } else if (!hasAiConnection.value) {
    seeded.value = true
    input.value = props.initialPrompt
  }
}
onMounted(maybeSeed)
watch(selectedConn, maybeSeed)

function applyProposal(m: ChatMessage) {
  if (!m.proposal) return
  emit('apply', {
    name: m.proposal.name,
    description: m.proposal.description,
    trigger: m.proposal.trigger,
    steps: m.proposal.steps
  })
}

const suggestions = [
  'Alert me when an Uptime Kuma monitor goes down',
  'On a schedule, check a server and notify me if disk is over 90%',
  'When a webhook fires, run a sequence of actions'
]
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- no AI connector yet: inline setup -->
    <template v-if="!hasAiConnection">
      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-sparkles"
          title="Set up an AI connector to use the assistant"
          description="Connect OpenAI, Anthropic, a local model (LM Studio), or any compatible endpoint. It stays on this server."
        />
        <div
          v-if="aiMeta"
          class="space-y-4 rounded-xl border border-default p-4"
        >
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
      </div>
    </template>

    <!-- chat -->
    <template v-else>
      <div
        ref="listEl"
        class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
      >
        <!-- empty state -->
        <div
          v-if="!started"
          class="flex h-full flex-col items-center justify-center px-2 text-center"
        >
          <span class="mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-sparkles"
              class="size-5"
            />
          </span>
          <p class="font-medium text-highlighted">
            Describe the flow you want
          </p>
          <p class="mx-auto mt-1 max-w-xs text-sm text-muted">
            I’ll ask for anything I need with ready-to-use pickers, then build it for you to review.
          </p>
          <div class="mt-4 flex flex-col gap-2">
            <button
              v-for="s in suggestions"
              :key="s"
              type="button"
              class="rounded-full border border-default px-3 py-1 text-xs text-muted transition-colors hover:bg-elevated hover:text-highlighted"
              @click="send(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <!-- messages -->
        <template
          v-for="m in messages"
          :key="m.id"
        >
          <!-- user -->
          <div
            v-if="m.role === 'user'"
            class="flex justify-end"
          >
            <div class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-inverted">
              {{ m.text }}
            </div>
          </div>

          <!-- assistant -->
          <div
            v-else
            class="flex gap-2.5"
          >
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UIcon
                name="i-lucide-sparkles"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1 space-y-2.5">
              <div
                v-if="m.text"
                class="inline-block max-w-full whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-elevated px-3.5 py-2 text-sm text-default"
              >
                {{ m.text }}
              </div>

              <!-- inline dynamic controls -->
              <div
                v-if="m.questions && m.answers"
                class="space-y-3 rounded-xl border border-default bg-default p-3"
                :class="{ 'opacity-70': m.answered }"
              >
                <div class="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <UIcon
                    name="i-lucide-list-checks"
                    class="size-3.5"
                  />
                  Pick from what I found
                </div>

                <UFormField
                  v-for="q in m.questions"
                  :key="q.id"
                  :label="q.label"
                  :description="q.help"
                  :required="q.required !== false"
                >
                  <!-- single / multi select -->
                  <USelect
                    v-if="q.kind === 'select' || q.kind === 'multiselect'"
                    v-model="m.answers[q.id]"
                    :items="q.options"
                    :multiple="q.kind === 'multiselect'"
                    value-key="value"
                    placeholder="Choose an option"
                    class="w-full"
                    :disabled="m.answered"
                  />
                  <!-- boolean: segmented buttons -->
                  <div
                    v-else-if="q.kind === 'boolean'"
                    class="flex gap-2"
                  >
                    <UButton
                      v-for="opt in q.options"
                      :key="opt.value"
                      :label="opt.label"
                      size="sm"
                      :color="m.answers[q.id] === opt.value ? 'primary' : 'neutral'"
                      :variant="m.answers[q.id] === opt.value ? 'solid' : 'soft'"
                      :disabled="m.answered"
                      @click="m.answers[q.id] = opt.value"
                    />
                  </div>
                  <!-- number -->
                  <UInputNumber
                    v-else-if="q.kind === 'number'"
                    v-model="(m.answers[q.id] as number)"
                    class="w-full"
                    :disabled="m.answered"
                  />
                  <!-- free text -->
                  <UInput
                    v-else
                    v-model="(m.answers[q.id] as string)"
                    class="w-full"
                    :placeholder="q.help || 'Type your answer'"
                    :disabled="m.answered"
                  />
                </UFormField>

                <div class="flex justify-end">
                  <UButton
                    label="Continue"
                    icon="i-lucide-arrow-right"
                    size="sm"
                    :loading="sending"
                    :disabled="m.answered"
                    @click="submitAnswers(m)"
                  />
                </div>
              </div>

              <!-- inline flow proposal -->
              <div
                v-if="m.proposal"
                class="rounded-xl border border-primary/40 bg-default p-3 ring-1 ring-primary/20"
              >
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-workflow"
                    class="size-4 text-primary"
                  />
                  <span class="font-medium text-highlighted">{{ m.proposal.name }}</span>
                </div>
                <p
                  v-if="m.proposal.description"
                  class="mt-1 text-sm text-muted"
                >
                  {{ m.proposal.description }}
                </p>
                <ol class="mt-2 space-y-1 text-sm">
                  <li
                    v-for="(s, i) in m.proposal.steps"
                    :key="s.id"
                    class="flex items-center gap-2 text-muted"
                  >
                    <span class="font-mono text-xs text-dimmed">{{ i + 1 }}.</span>
                    {{ stepSummary(s) }}
                  </li>
                </ol>
                <div class="mt-3 flex justify-end">
                  <UButton
                    label="Use this flow"
                    icon="i-lucide-check"
                    size="sm"
                    @click="applyProposal(m)"
                  />
                </div>
                <p class="mt-2 text-xs text-dimmed">
                  You’ll be able to review and tweak every step before saving.
                </p>
              </div>
            </div>
          </div>
        </template>

        <!-- thinking indicator -->
        <div
          v-if="sending"
          class="flex gap-2.5"
        >
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-sparkles"
              class="size-4"
            />
          </span>
          <div class="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-elevated px-3.5 py-3">
            <span class="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
            <span class="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
            <span class="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
          </div>
        </div>
      </div>

      <!-- composer -->
      <div class="border-t border-default p-3">
        <UChatPrompt
          v-model="input"
          :loading="sending"
          placeholder="Describe what you want to automate…"
          @submit="send()"
        >
          <UChatPromptSubmit color="neutral" />
          <template #footer>
            <div class="flex w-full items-center gap-2">
              <USelect
                v-model="selectedConnId"
                :items="connItems"
                value-key="value"
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
      </div>
    </template>
  </div>
</template>
