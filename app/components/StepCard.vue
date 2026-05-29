<script setup lang="ts">
import type { ActionStep, Connection, FlowStep, ForEachStep, IntegrationMeta, StateStep, ConditionStep } from '~/types'
import { STATE_OPS, stepTitle } from '~/composables/builder'

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
const icon = computed(() => {
  switch (props.step.type) {
    case 'action': return 'i-lucide-zap'
    case 'condition': return 'i-lucide-git-branch'
    case 'forEach': return 'i-lucide-repeat'
    case 'state': return 'i-lucide-database'
  }
  return 'i-lucide-circle'
})

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
const connectionItems = computed(() =>
  props.connections
    .filter(c => c.integrationId === asAction.value.integrationId)
    .map(c => ({ label: c.name, value: c.id }))
)
const kumaActionSchema = useKumaMonitorSchema({
  enabled: computed(() => asAction.value.integrationId === 'kuma'),
  connectionId: computed(() => asAction.value.connectionId),
  schema: computed(() => currentAction.value?.inputSchema ?? []),
  values: computed(() => asAction.value.input)
})
const renderedActionSchema = computed(() => kumaActionSchema.schema.value)

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
    class="rounded-xl border border-default bg-default"
    :class="depth ? 'border-dashed' : ''"
  >
    <!-- header row -->
    <div class="flex items-center gap-3 px-4 py-3">
      <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
        <UIcon
          :name="icon"
          class="size-4"
        />
      </span>
      <button
        type="button"
        class="min-w-0 flex-1 text-left"
        @click="expanded = !expanded"
      >
        <p class="truncate text-sm font-medium text-highlighted">
          <span class="text-dimmed">{{ index + 1 }}.</span> {{ title }}
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
  </div>
</template>
