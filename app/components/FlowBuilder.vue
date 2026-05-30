<script setup lang="ts">
import type { Connection, Flow, FlowDefinition, FlowDraft, FlowStep, FlowTrigger, IntegrationMeta, NotifyOnRun, TriggerMeta } from '~/types'
import { blankStep, STEP_TYPE_OPTIONS } from '~/composables/builder'

const props = defineProps<{
  catalog: IntegrationMeta[]
  connections: Connection[]
  /** existing flow, or null for a new one */
  flow: Flow | null
  /** prefilled values for a new flow */
  draft?: FlowDraft | null
}>()
const emit = defineEmits<{ saved: [id: string] }>()

const toast = useToast()
const router = useRouter()

const initialFlow = props.flow ?? props.draft ?? null

const name = ref(initialFlow?.name ?? '')
const description = ref(initialFlow?.description ?? '')
const enabled = ref(initialFlow?.enabled ?? true)
// allow unauthenticated visitors of a public board to run this flow
const publicTrigger = ref(initialFlow?.publicTrigger ?? false)

// trigger: kind selector. We model 3 built-in kinds + integration poll triggers.
type TriggerKind = 'manual' | 'cron' | 'webhook' | 'poll'
const trigger = ref<FlowTrigger>(
  initialFlow?.definition?.trigger ?? { integrationId: 'core', triggerId: 'manual', config: {} }
)
const triggerKind = ref<TriggerKind>(
  trigger.value.integrationId === 'core' && trigger.value.triggerId === 'cron'
    ? 'cron'
    : trigger.value.triggerId === 'webhook'
      ? 'webhook'
      : trigger.value.triggerId === 'manual'
        ? 'manual'
        : 'poll'
)

const steps = ref<FlowStep[]>(initialFlow?.definition?.steps ?? [])

// The AI assistant is presented as a floating chat (FlowChatDock). When the
// user accepts a proposed flow it fills the very same name/trigger/steps refs
// the manual builder edits, so they can review and tweak before saving.
function onAssistApply(draft: { name: string, description: string, trigger: FlowTrigger, steps: FlowStep[] }) {
  if (draft.name) name.value = draft.name
  if (draft.description) description.value = draft.description
  trigger.value = draft.trigger
  // re-derive the trigger-kind selector from the AI-proposed trigger
  triggerKind.value
    = trigger.value.integrationId === 'core' && trigger.value.triggerId === 'cron'
      ? 'cron'
      : trigger.value.triggerId === 'webhook'
        ? 'webhook'
        : trigger.value.triggerId === 'manual'
          ? 'manual'
          : 'poll'
  steps.value = draft.steps
  toast.add({ title: 'Flow drafted — review and save', color: 'success', icon: 'i-lucide-sparkles' })
}

// browser-notification-on-run setting
const { supported: pushSupported, enabled: pushEnabled, refresh: refreshPush } = usePush()
onMounted(refreshPush)
const notifyOnRun = ref<NotifyOnRun>(initialFlow?.definition?.notifyOnRun ?? 'never')
const notifyItems = [
  { label: 'Don’t notify', value: 'never', icon: 'i-lucide-bell-off' },
  { label: 'On every run', value: 'always', icon: 'i-lucide-bell-ring' },
  { label: 'Only when it fails', value: 'failure', icon: 'i-lucide-triangle-alert' },
  { label: 'Only when it succeeds', value: 'success', icon: 'i-lucide-circle-check' }
]

// poll triggers available across integrations
const pollTriggers = computed(() =>
  props.catalog.flatMap(i =>
    i.triggers.filter(t => t.kind === 'poll').map(t => ({ integration: i, trigger: t }))
  )
)

// Trigger kinds presented as tappable cards (Siri-Shortcuts style) rather than a
// bare dropdown — `hint` keeps each choice in plain language.
const triggerKindItems = [
  { label: 'I tap a button', value: 'manual', icon: 'i-lucide-mouse-pointer-click', hint: 'Run it on demand' },
  { label: 'On a schedule', value: 'cron', icon: 'i-lucide-clock', hint: 'Every morning, hourly…' },
  { label: 'A webhook calls in', value: 'webhook', icon: 'i-lucide-webhook', hint: 'From GitHub, CI, anything' },
  { label: 'A service event', value: 'poll', icon: 'i-lucide-radio', hint: 'A monitor goes down, etc.' }
]

function onTriggerKind(k: TriggerKind) {
  triggerKind.value = k
  if (k === 'manual') {
    trigger.value = { integrationId: 'core', triggerId: 'manual', config: {} }
  } else if (k === 'cron') {
    // Preserve an existing schedule config when re-selecting cron; otherwise
    // seed a sensible default. The full schedule lives in config (ScheduleConfig).
    const existing = trigger.value.integrationId === 'core' && trigger.value.triggerId === 'cron' ? trigger.value.config : null
    trigger.value = {
      integrationId: 'core',
      triggerId: 'cron',
      config: existing && Object.keys(existing).length ? existing : { mode: 'cron', cron: '*/5 * * * *', timezone: browserTz() }
    }
  } else if (k === 'webhook') {
    trigger.value = { integrationId: 'core', triggerId: 'webhook', config: { webhookSecret: trigger.value.config?.webhookSecret ?? randomSecret() } }
  } else {
    const first = pollTriggers.value[0]
    trigger.value = first
      ? { integrationId: first.integration.id, triggerId: first.trigger.id, connectionId: null, config: {} }
      : { integrationId: 'core', triggerId: 'manual', config: {} }
  }
}

function randomSecret() {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
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
const kumaTriggerSchema = useKumaMonitorSchema({
  enabled: computed(() => triggerKind.value === 'poll' && trigger.value.integrationId === 'kuma'),
  connectionId: computed(() => trigger.value.connectionId),
  schema: computed(() => selectedPoll.value?.trigger.configSchema ?? []),
  values: computed(() => trigger.value.config)
})
const renderedTriggerSchema = computed(() => kumaTriggerSchema.schema.value)
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
  const definition: FlowDefinition = { trigger: trigger.value, steps: steps.value, notifyOnRun: notifyOnRun.value }
  saving.value = true
  try {
    if (props.flow) {
      await $fetch(`/api/flows/${props.flow.id}`, {
        method: 'PUT',
        body: { name: name.value, description: description.value, enabled: enabled.value, publicTrigger: publicTrigger.value, definition }
      })
      toast.add({ title: 'Flow saved', color: 'success' })
      emit('saved', props.flow.id)
    } else {
      const res = await $fetch<{ id: string }>('/api/flows', {
        method: 'POST',
        body: { name: name.value, description: description.value, enabled: enabled.value, publicTrigger: publicTrigger.value, definition }
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
  <div class="space-y-8">
    <!-- name + meta -->
    <UCard>
      <div class="space-y-4">
        <UFormField
          label="Name this flow"
          required
        >
          <UInput
            v-model="name"
            placeholder="e.g. Morning backup check"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Description"
          description="Optional — a one-line reminder of what it does."
        >
          <UInput
            v-model="description"
            placeholder="What does this flow do?"
            class="w-full"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- trigger -->
    <section>
      <h2 class="mb-3 flex items-center gap-2.5 text-sm font-semibold text-highlighted">
        <span class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
        When should this run?
      </h2>
      <UCard>
        <div class="space-y-5">
          <!-- tappable trigger-kind cards -->
          <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <button
              v-for="opt in triggerKindItems"
              :key="opt.value"
              type="button"
              class="flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all"
              :class="triggerKind === opt.value
                ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                : 'border-default hover:border-primary/40 hover:bg-elevated'"
              @click="onTriggerKind(opt.value as TriggerKind)"
            >
              <UIcon
                :name="opt.icon"
                class="size-5"
                :class="triggerKind === opt.value ? 'text-primary' : 'text-muted'"
              />
              <span
                class="text-sm font-medium leading-tight"
                :class="triggerKind === opt.value ? 'text-primary' : 'text-highlighted'"
              >{{ opt.label }}</span>
              <span class="text-xs text-muted">{{ opt.hint }}</span>
            </button>
          </div>

          <ScheduleBuilder
            v-if="triggerKind === 'cron'"
            v-model="trigger.config"
          />

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
              :schema="renderedTriggerSchema"
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
    </section>

    <!-- steps -->
    <section>
      <h2 class="mb-3 flex items-center gap-2.5 text-sm font-semibold text-highlighted">
        <span class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
        Then do this…
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

        <!-- friendly empty state before any actions exist -->
        <div
          v-if="steps.length === 0"
          class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-default px-6 py-10 text-center"
        >
          <span class="flex size-11 items-center justify-center rounded-2xl bg-elevated text-dimmed">
            <UIcon
              name="i-lucide-list-plus"
              class="size-5.5"
            />
          </span>
          <p class="text-sm text-muted">
            No actions yet. Add the first thing this flow should do.
          </p>
        </div>

        <UPopover v-model:open="addOpen">
          <UButton
            icon="i-lucide-plus"
            :label="steps.length === 0 ? 'Add the first action' : 'Add another action'"
            color="neutral"
            :variant="steps.length === 0 ? 'solid' : 'soft'"
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
    </section>

    <!-- options: the less-common settings, tucked away so the main path stays
         simple (name → when → what → create) -->
    <UCollapsible
      :default-open="notifyOnRun !== 'never' || publicTrigger"
      class="rounded-2xl border border-default"
    >
      <UButton
        color="neutral"
        variant="ghost"
        block
        trailing-icon="i-lucide-chevron-down"
        class="group justify-between p-4"
        :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
      >
        <span class="flex items-center gap-2 text-sm font-semibold text-highlighted">
          <UIcon
            name="i-lucide-sliders-horizontal"
            class="size-4 text-muted"
          />
          Options
        </span>
      </UButton>

      <template #content>
        <div class="space-y-6 border-t border-default p-4">
          <!-- notify on run -->
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-sm font-medium text-highlighted">
              <UIcon
                name="i-lucide-bell"
                class="size-4 text-muted"
              />
              Notify me when it runs
            </div>
            <USelect
              v-model="notifyOnRun"
              :items="notifyItems"
              class="w-full"
            />
            <p class="text-xs text-muted">
              Sends a browser notification to every device that has notifications turned on (the bell in the top bar).
            </p>
            <UAlert
              v-if="notifyOnRun !== 'never' && pushSupported && !pushEnabled"
              color="warning"
              variant="soft"
              icon="i-lucide-bell-off"
              title="Notifications are off on this device"
              description="Turn them on with the bell in the top bar to receive these on this browser."
              :ui="{ description: 'text-xs' }"
            />
          </div>

          <!-- public triggering -->
          <div class="flex items-start justify-between gap-4 border-t border-default pt-5">
            <div class="space-y-1">
              <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
                <UIcon
                  name="i-lucide-globe"
                  class="size-4 text-muted"
                />
                Public triggering
              </p>
              <p class="text-sm text-muted">
                Let unauthenticated visitors run this flow when it appears on a public board.
              </p>
              <p class="text-xs text-dimmed">
                A board marked “public trigger” overrides this and enables it for every flow on that board.
              </p>
            </div>
            <USwitch v-model="publicTrigger" />
          </div>
        </div>
      </template>
    </UCollapsible>

    <!-- footer actions -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 border-t border-default pt-5"
    >
      <div class="flex items-center gap-2">
        <USwitch v-model="enabled" />
        <span class="text-sm text-muted">{{ enabled ? 'Enabled' : 'Disabled' }}</span>
      </div>
      <div class="flex gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          to="/flows"
        />
        <UButton
          :label="flow ? 'Save changes' : 'Create flow'"
          :loading="saving"
          icon="i-lucide-check"
          @click="save"
        />
      </div>
    </div>

    <!-- floating AI assistant -->
    <FlowChatDock
      :catalog="catalog"
      :connections="connections"
      :button-label="flow ? 'Edit with AI' : 'Build with AI'"
      @apply="onAssistApply"
    />
  </div>
</template>
