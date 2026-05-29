<script setup lang="ts">
import type { Connection, Flow, FlowDefinition, FlowStep, FlowTrigger, IntegrationMeta, TriggerMeta } from '~/types'
import { blankStep, STEP_TYPE_OPTIONS } from '~/composables/builder'

const props = defineProps<{
  catalog: IntegrationMeta[]
  connections: Connection[]
  /** existing flow, or null for a new one */
  flow: Flow | null
}>()
const emit = defineEmits<{ saved: [id: string] }>()

const toast = useToast()
const router = useRouter()

const name = ref(props.flow?.name ?? '')
const description = ref(props.flow?.description ?? '')
const enabled = ref(props.flow?.enabled ?? true)

// trigger: kind selector. We model 3 built-in kinds + integration poll triggers.
type TriggerKind = 'manual' | 'cron' | 'webhook' | 'poll'
const trigger = ref<FlowTrigger>(
  props.flow?.definition?.trigger ?? { integrationId: 'core', triggerId: 'manual', config: {} }
)
const triggerKind = ref<TriggerKind>(
  props.flow?.cron
    ? 'cron'
    : trigger.value.triggerId === 'webhook'
      ? 'webhook'
      : trigger.value.triggerId === 'manual'
        ? 'manual'
        : 'poll'
)

const steps = ref<FlowStep[]>(props.flow?.definition?.steps ?? [])

// poll triggers available across integrations
const pollTriggers = computed(() =>
  props.catalog.flatMap(i =>
    i.triggers.filter(t => t.kind === 'poll').map(t => ({ integration: i, trigger: t }))
  )
)

const triggerKindItems = [
  { label: 'Manually (a button)', value: 'manual', icon: 'i-lucide-mouse-pointer-click' },
  { label: 'On a schedule (cron)', value: 'cron', icon: 'i-lucide-clock' },
  { label: 'From a webhook', value: 'webhook', icon: 'i-lucide-webhook' },
  { label: 'When a service event happens', value: 'poll', icon: 'i-lucide-radio' }
]

function onTriggerKind(k: TriggerKind) {
  triggerKind.value = k
  if (k === 'manual') trigger.value = { integrationId: 'core', triggerId: 'manual', config: {} }
  else if (k === 'cron') trigger.value = { integrationId: 'core', triggerId: 'cron', config: {}, cron: trigger.value.cron ?? '*/5 * * * *' }
  else if (k === 'webhook') trigger.value = { integrationId: 'core', triggerId: 'webhook', config: { webhookSecret: trigger.value.config?.webhookSecret ?? randomSecret() } }
  else {
    const first = pollTriggers.value[0]
    trigger.value = first
      ? { integrationId: first.integration.id, triggerId: first.trigger.id, connectionId: null, config: {} }
      : { integrationId: 'core', triggerId: 'manual', config: {} }
  }
}

function randomSecret() {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

const selectedPoll = computed<{ integration: IntegrationMeta, trigger: TriggerMeta } | undefined>(() =>
  pollTriggers.value.find(p => p.integration.id === trigger.value.integrationId && p.trigger.id === trigger.value.triggerId)
)
const pollConnItems = computed(() =>
  props.connections.filter(c => c.integrationId === trigger.value.integrationId).map(c => ({ label: c.name, value: c.id }))
)
const pollItems = computed(() =>
  pollTriggers.value.map(p => ({ label: `${p.integration.name}: ${p.trigger.name}`, value: `${p.integration.id}:${p.trigger.id}` }))
)
function onPollSelect(v: string) {
  const [iid, tid] = v.split(':')
  trigger.value = { integrationId: iid!, triggerId: tid!, connectionId: null, config: {} }
}

// ---- step list mutations ----
function addStep(type: FlowStep['type']) {
  steps.value = [...steps.value, blankStep(type)]
  addOpen.value = false
}
function updateStep(i: number, s: FlowStep) {
  steps.value = steps.value.map((x, idx) => (idx === i ? s : x))
}
function removeStep(i: number) {
  steps.value = steps.value.filter((_, idx) => idx !== i)
}
function moveStep(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= steps.value.length) return
  const copy = [...steps.value]
  ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  steps.value = copy
}
const addOpen = ref(false)

// webhook url display
const webhookUrl = computed(() => {
  if (triggerKind.value !== 'webhook' || !props.flow) return ''
  const secret = trigger.value.config?.webhookSecret as string
  return `${location.origin}/api/hooks/${props.flow.id}?secret=${secret}`
})

const saving = ref(false)
async function save() {
  if (!name.value.trim()) {
    toast.add({ title: 'Give your flow a name', color: 'warning' })
    return
  }
  const definition: FlowDefinition = { trigger: trigger.value, steps: steps.value }
  saving.value = true
  try {
    if (props.flow) {
      await $fetch(`/api/flows/${props.flow.id}`, {
        method: 'PUT',
        body: { name: name.value, description: description.value, enabled: enabled.value, definition }
      })
      toast.add({ title: 'Flow saved', color: 'success' })
      emit('saved', props.flow.id)
    } else {
      const res = await $fetch<{ id: string }>('/api/flows', {
        method: 'POST',
        body: { name: name.value, description: description.value, enabled: enabled.value, definition }
      })
      toast.add({ title: 'Flow created', color: 'success' })
      router.push(`/flows/${res.id}`)
    }
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
    toast.add({ title: msg, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- name + meta -->
    <UCard>
      <div class="space-y-4">
        <UFormField
          label="Flow name"
          required
        >
          <UInput
            v-model="name"
            placeholder="e.g. RustFS failover"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Description">
          <UInput
            v-model="description"
            placeholder="What does this flow do?"
            class="w-full"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- trigger -->
    <div>
      <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-zap"
          class="size-4 text-primary"
        />
        When should this run?
      </h2>
      <UCard>
        <div class="space-y-4">
          <USelect
            :model-value="triggerKind"
            :items="triggerKindItems"
            class="w-full"
            @update:model-value="onTriggerKind($event as TriggerKind)"
          />

          <UFormField
            v-if="triggerKind === 'cron'"
            label="Schedule (cron expression)"
            description="Five fields: minute hour day month weekday. Example: */5 * * * * = every 5 minutes."
          >
            <UInput
              :model-value="trigger.cron"
              placeholder="*/5 * * * *"
              class="w-full font-mono"
              @update:model-value="trigger.cron = $event"
            />
          </UFormField>

          <template v-else-if="triggerKind === 'webhook'">
            <UFormField
              label="Webhook secret"
              description="Include this as ?secret=… when calling the webhook."
            >
              <UInput
                :model-value="(trigger.config.webhookSecret as string)"
                class="w-full font-mono"
                @update:model-value="trigger.config = { ...trigger.config, webhookSecret: $event }"
              />
            </UFormField>
            <UAlert
              v-if="webhookUrl"
              color="neutral"
              variant="soft"
              icon="i-lucide-link"
              :description="webhookUrl"
              :ui="{ description: 'font-mono text-xs break-all' }"
            />
            <p
              v-else
              class="text-xs text-muted"
            >
              Save the flow to get its webhook URL.
            </p>
          </template>

          <template v-else-if="triggerKind === 'poll'">
            <UFormField label="Event">
              <USelect
                :model-value="`${trigger.integrationId}:${trigger.triggerId}`"
                :items="pollItems"
                placeholder="Choose an event"
                class="w-full"
                @update:model-value="onPollSelect($event as string)"
              />
            </UFormField>
            <UFormField
              v-if="selectedPoll?.trigger.needsConnection"
              label="Connection"
            >
              <USelect
                :model-value="trigger.connectionId ?? undefined"
                :items="pollConnItems"
                placeholder="Choose a connection"
                class="w-full"
                @update:model-value="trigger.connectionId = $event"
              />
            </UFormField>
            <SchemaForm
              v-if="selectedPoll && selectedPoll.trigger.configSchema.length"
              :model-value="trigger.config"
              :schema="selectedPoll.trigger.configSchema"
              @update:model-value="trigger.config = $event"
            />
          </template>

          <p
            v-else
            class="text-sm text-muted"
          >
            This flow runs only when you press “Run now”.
          </p>
        </div>
      </UCard>
    </div>

    <!-- steps -->
    <div>
      <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-list-ordered"
          class="size-4 text-primary"
        />
        Then do this
      </h2>

      <div class="space-y-2">
        <StepCard
          v-for="(s, i) in steps"
          :key="s.id"
          :step="s"
          :index="i"
          :catalog="catalog"
          :connections="connections"
          @update="updateStep(i, $event)"
          @remove="removeStep(i)"
          @move="moveStep(i, $event)"
        />

        <UPopover v-model:open="addOpen">
          <UButton
            icon="i-lucide-plus"
            label="Add step"
            color="neutral"
            variant="soft"
            block
          />
          <template #content>
            <div class="w-80 p-2">
              <button
                v-for="opt in STEP_TYPE_OPTIONS"
                :key="opt.type"
                type="button"
                class="flex w-full items-start gap-3 rounded-lg p-2.5 text-left hover:bg-elevated"
                @click="addStep(opt.type)"
              >
                <UIcon
                  :name="opt.icon"
                  class="mt-0.5 size-4 shrink-0 text-muted"
                />
                <span>
                  <span class="block text-sm font-medium text-highlighted">{{ opt.label }}</span>
                  <span class="block text-xs text-muted">{{ opt.help }}</span>
                </span>
              </button>
            </div>
          </template>
        </UPopover>
      </div>
    </div>

    <!-- footer actions -->
    <div class="flex flex-wrap items-center justify-between gap-4 border-t border-default pt-5">
      <div class="flex items-center gap-2">
        <USwitch v-model="enabled" />
        <span class="text-sm text-muted">{{ enabled ? 'Enabled' : 'Disabled' }}</span>
      </div>
      <div class="flex gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          to="/"
        />
        <UButton
          :label="flow ? 'Save changes' : 'Create flow'"
          :loading="saving"
          icon="i-lucide-check"
          @click="save"
        />
      </div>
    </div>
  </div>
</template>
