<script setup lang="ts">
import type { EmailDocument } from '#shared/email/blocks'
import { extractTemplateVariables } from '#shared/email/placeholders'
import type { ActionStep, Connection, FlowStep, ForEachStep, IntegrationMeta, StateStep, ConditionStep } from '~/types'
import { STATE_OPS, stepAccent, stepTitle } from '~/composables/builder'

const props = defineProps<{
  step: FlowStep
  index: number
  catalog: IntegrationMeta[]
  connections: Connection[]
  /** for nested forEach steps */
  depth?: number
}>()
const emit = defineEmits<{
  update: [FlowStep]
  remove: []
  move: [dir: -1 | 1]
}>()

const expanded = ref(props.step.type === 'action' && !(props.step as ActionStep).actionId)

function patch(p: Partial<FlowStep>) {
  emit('update', { ...props.step, ...p } as FlowStep)
}

const title = computed(() => stepTitle(props.step, props.catalog))
const accent = computed(() => stepAccent(props.step))

// ---- action step helpers ----
const asAction = computed(() => props.step as ActionStep)
const integrationItems = computed(() =>
  props.catalog.map(i => ({ label: i.name, value: i.id, icon: i.icon }))
)
const currentIntegration = computed<IntegrationMeta | undefined>(() =>
  props.catalog.find(i => i.id === asAction.value.integrationId)
)
const actionItems = computed(() =>
  (currentIntegration.value?.actions ?? []).map(a => ({ label: a.name, value: a.id }))
)
const currentAction = computed(() =>
  currentIntegration.value?.actions.find(a => a.id === asAction.value.actionId)
)
// short line under the title in the card header (the "app" the action belongs to)
const subtitle = computed(() => {
  if (props.step.type === 'action') return currentIntegration.value?.name ?? ''
  if (props.step.type === 'forEach') return 'Loop'
  if (props.step.type === 'condition') return 'Check'
  if (props.step.type === 'state') return 'Remember'
  return ''
})
// the magic-variable refs this step makes available to later steps
const provides = computed<string[]>(() => {
  if (props.step.type !== 'action') return []
  return (currentAction.value?.outputKeys ?? []).map(k => `${k}`)
})
const connectionItems = computed(() =>
  props.connections
    .filter(c => c.integrationId === asAction.value.integrationId)
    .map(c => ({ label: c.name, value: c.id }))
)
interface EmailProjectSummary {
  id: string
  name: string
  subject: string
}
interface EmailProjectDetail {
  id: string
  name: string
  document: EmailDocument
}
const { data: emailProjects } = useFetch<EmailProjectSummary[]>('/api/email-projects', {
  key: 'email-project-options',
  default: () => []
})
const isMailgunSend = computed(() =>
  asAction.value.integrationId === 'mailgun' && asAction.value.actionId === 'sendEmail'
)
const mailgunSchema = computed(() => {
  if (!currentAction.value) return []
  if (!isMailgunSend.value) return currentAction.value.inputSchema
  return currentAction.value.inputSchema.map((field) => {
    if (field.key !== 'templateId') return field
    return {
      ...field,
      options: emailProjects.value.map(project => ({
        label: project.subject ? `${project.name} · ${project.subject}` : project.name,
        value: project.id
      }))
    }
  })
})
const kumaActionSchema = useKumaMonitorSchema({
  enabled: computed(() => asAction.value.integrationId === 'kuma'),
  connectionId: computed(() => asAction.value.connectionId),
  schema: computed(() => mailgunSchema.value),
  values: computed(() => asAction.value.input)
})
const haActionSchema = useHomeAssistantSchema({
  enabled: computed(() => asAction.value.integrationId === 'homeassistant'),
  connectionId: computed(() => asAction.value.connectionId),
  schema: computed(() => kumaActionSchema.schema.value),
  values: computed(() => asAction.value.input)
})
const renderedActionSchema = computed(() => haActionSchema.schema.value)
const selectedTemplateId = computed(() => {
  if (!isMailgunSend.value || asAction.value.input.contentMode !== 'template') return ''
  return String(asAction.value.input.templateId ?? '').trim()
})
const selectedTemplate = ref<EmailProjectDetail | null>(null)
const loadingTemplate = ref(false)
const templateLoadError = ref('')
const templateVariableKeys = computed(() =>
  selectedTemplate.value ? extractTemplateVariables(selectedTemplate.value.document) : []
)
const configuredTemplateVariables = computed(() => {
  const raw = asAction.value.input.templateVariables
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
})
const missingTemplateVariables = computed(() =>
  templateVariableKeys.value.filter((key) => {
    const value = configuredTemplateVariables.value[key]
    return value == null || String(value).trim() === ''
  })
)

watch(selectedTemplateId, async (templateId) => {
  selectedTemplate.value = null
  templateLoadError.value = ''
  if (!templateId) return

  loadingTemplate.value = true
  try {
    selectedTemplate.value = await $fetch<EmailProjectDetail>(`/api/email-projects/${templateId}`)
  } catch {
    templateLoadError.value = 'Could not load template details.'
  } finally {
    loadingTemplate.value = false
  }
}, { immediate: true })

watch([templateVariableKeys, configuredTemplateVariables], ([keys, currentVars]) => {
  if (!isMailgunSend.value || asAction.value.input.contentMode !== 'template' || !keys.length) return

  let changed = false
  const next: Record<string, unknown> = { ...currentVars }
  for (const key of keys) {
    if (!Object.hasOwn(next, key)) {
      next[key] = ''
      changed = true
    }
  }
  if (!changed) return

  patch({
    input: {
      ...asAction.value.input,
      templateVariables: next
    }
  } as Partial<ActionStep>)
}, { immediate: true })

function setIntegration(id: string) {
  patch({ integrationId: id, actionId: '', connectionId: null, input: {} } as Partial<ActionStep>)
}
function setAction(id: string) {
  patch({ actionId: id, input: {} } as Partial<ActionStep>)
}
function setInput(v: Record<string, unknown>) {
  patch({ input: v } as Partial<ActionStep>)
}

// ---- state step helpers ----
const asState = computed(() => props.step as StateStep)
const showValue = computed(() => ['set', 'increment'].includes(asState.value.op))
const showAmount = computed(() => ['cooldownGate', 'thresholdGate'].includes(asState.value.op))
const showGate = computed(() => showAmount.value)
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border border-default bg-default shadow-sm transition-shadow hover:shadow-md"
    :class="depth ? 'border-dashed' : ''"
  >
    <!-- header row -->
    <div class="flex items-center gap-3 px-3 py-2.5">
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
        :class="accent.tile"
      >
        <UIcon
          :name="accent.icon"
          class="size-4.5"
        />
      </span>
      <button
        type="button"
        class="min-w-0 flex-1 text-left"
        @click="expanded = !expanded"
      >
        <p class="truncate text-sm font-medium leading-tight text-highlighted">
          <span class="text-dimmed">{{ index + 1 }}.</span> {{ title }}
        </p>
        <p
          v-if="subtitle"
          class="truncate text-xs text-muted"
        >
          {{ subtitle }}
        </p>
      </button>
      <div class="flex items-center gap-0.5">
        <UButton
          icon="i-lucide-chevron-up"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Move up"
          @click="emit('move', -1)"
        />
        <UButton
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Move down"
          @click="emit('move', 1)"
        />
        <UButton
          :icon="expanded ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Expand"
          @click="expanded = !expanded"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="Remove step"
          @click="emit('remove')"
        />
      </div>
    </div>

    <!-- expanded body -->
    <div
      v-if="expanded"
      class="space-y-4 border-t border-default px-4 py-4"
    >
      <!-- ACTION -->
      <template v-if="step.type === 'action'">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Service">
            <USelect
              :model-value="asAction.integrationId"
              :items="integrationItems"
              placeholder="Choose a service"
              class="w-full"
              @update:model-value="setIntegration($event as string)"
            />
          </UFormField>
          <UFormField label="Action">
            <USelect
              :model-value="asAction.actionId"
              :items="actionItems"
              :disabled="!asAction.integrationId"
              placeholder="Choose an action"
              class="w-full"
              @update:model-value="setAction($event as string)"
            />
          </UFormField>
        </div>

        <p
          v-if="currentAction?.description"
          class="text-xs text-muted"
        >
          {{ currentAction.description }}
        </p>

        <UFormField
          v-if="currentAction?.needsConnection"
          label="Connection"
          description="Which saved credentials to use."
        >
          <USelect
            :model-value="asAction.connectionId ?? undefined"
            :items="connectionItems"
            placeholder="Choose a connection"
            class="w-full"
            @update:model-value="patch({ connectionId: $event } as Partial<ActionStep>)"
          />
          <template
            v-if="connectionItems.length === 0"
            #help
          >
            <span class="text-warning">No {{ currentIntegration?.name }} connection yet — add one on the Connections page.</span>
          </template>
        </UFormField>

        <template v-if="currentAction && currentAction.inputSchema.length">
          <USeparator label="Inputs" />
          <SchemaForm
            :model-value="asAction.input"
            :schema="renderedActionSchema"
            allow-refs
            @update:model-value="setInput($event)"
          />
          <UAlert
            v-if="isMailgunSend && asAction.input.contentMode === 'template' && !emailProjects.length"
            color="warning"
            variant="soft"
            icon="i-lucide-mail-warning"
            title="No email templates yet"
            description="Create an email project on the Email designer page first, then come back and attach it here."
          />
          <UAlert
            v-else-if="isMailgunSend && asAction.input.contentMode === 'template' && loadingTemplate"
            color="neutral"
            variant="soft"
            icon="i-lucide-loader-circle"
            title="Loading template"
            description="Checking this email project for variables."
          />
          <UAlert
            v-else-if="isMailgunSend && asAction.input.contentMode === 'template' && templateLoadError"
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="templateLoadError"
          />
          <UAlert
            v-else-if="isMailgunSend && asAction.input.contentMode === 'template' && selectedTemplate"
            :color="missingTemplateVariables.length ? 'warning' : 'success'"
            variant="soft"
            :icon="missingTemplateVariables.length ? 'i-lucide-braces' : 'i-lucide-check-check'"
            :title="missingTemplateVariables.length ? 'Template variables need values' : 'Template variables are ready'"
            :description="templateVariableKeys.length
              ? `${templateVariableKeys.join(', ')}${missingTemplateVariables.length ? ` · missing: ${missingTemplateVariables.join(', ')}` : ''}`
              : 'This template does not declare any placeholders.'"
          />
        </template>
      </template>

      <!-- CONDITION -->
      <template v-else-if="step.type === 'condition'">
        <UFormField
          label="Continue only when all of these are true"
          description="Otherwise the flow stops here."
        >
          <ConditionEditor
            :model-value="(step as ConditionStep).expr"
            @update:model-value="patch({ expr: $event } as Partial<ConditionStep>)"
          />
        </UFormField>
      </template>

      <!-- STATE -->
      <template v-else-if="step.type === 'state'">
        <UFormField
          label="What to do"
          :description="STATE_OPS.find(o => o.value === asState.op)?.help"
        >
          <USelect
            :model-value="asState.op"
            :items="STATE_OPS"
            class="w-full"
            @update:model-value="patch({ op: $event } as Partial<StateStep>)"
          />
        </UFormField>
        <UFormField
          label="Name"
          description="The label to store under. Add a {{ ref }} to keep separate values per item, e.g. fails:{{ trigger.host }}."
        >
          <UInput
            :model-value="asState.key"
            placeholder="failCount"
            class="w-full"
            @update:model-value="patch({ key: $event } as Partial<StateStep>)"
          />
        </UFormField>
        <UFormField
          v-if="showValue"
          label="Value"
        >
          <UInput
            :model-value="(asState.value as string)"
            class="w-full"
            @update:model-value="patch({ value: $event } as Partial<StateStep>)"
          />
        </UFormField>
        <UFormField
          v-if="showAmount"
          :label="asState.op === 'cooldownGate' ? 'Cooldown (milliseconds)' : 'Threshold (count)'"
        >
          <UInput
            :model-value="asState.amount"
            type="number"
            class="w-full"
            @update:model-value="patch({ amount: Number($event) } as Partial<StateStep>)"
          />
        </UFormField>
        <UFormField
          v-if="showGate"
          label="If the gate fails"
        >
          <USelect
            :model-value="asState.onFail ?? 'stop'"
            :items="[{ label: 'Stop the flow', value: 'stop' }, { label: 'Keep going', value: 'continue' }]"
            class="w-full"
            @update:model-value="patch({ onFail: $event } as Partial<StateStep>)"
          />
        </UFormField>
      </template>

      <!-- FOREACH -->
      <template v-else-if="step.type === 'forEach'">
        <UFormField
          label="List to repeat over"
          description="A {{ ref }} pointing at a list from an earlier step."
        >
          <UInput
            :model-value="(step as ForEachStep).items"
            placeholder="{{ steps.list.records }}"
            class="w-full"
            @update:model-value="patch({ items: $event } as Partial<ForEachStep>)"
          />
        </UFormField>
        <UFormField
          label="Call each item"
          description="Reference the current item as {{ <name>.item }} inside the steps below."
        >
          <UInput
            :model-value="(step as ForEachStep).as"
            placeholder="item"
            class="w-full"
            @update:model-value="patch({ as: $event } as Partial<ForEachStep>)"
          />
        </UFormField>
        <p class="text-xs text-muted">
          Steps inside the loop run for each item. (Edit nested steps below.)
        </p>
        <slot name="nested" />
      </template>
    </div>

    <!-- provides: the variables later steps can reference from this one -->
    <div
      v-if="expanded && provides.length"
      class="flex flex-wrap items-center gap-1.5 border-t border-default bg-elevated/40 px-4 py-2.5"
    >
      <span class="inline-flex items-center gap-1 text-xs font-medium text-dimmed">
        <UIcon
          name="i-lucide-braces"
          class="size-3.5"
        />
        Provides
      </span>
      <span
        v-for="k in provides"
        :key="k"
        class="rounded-full border border-default bg-default px-2 py-0.5 font-mono text-xs text-muted"
      >{{ k }}</span>
    </div>
  </div>
</template>
