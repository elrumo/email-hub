<script setup lang="ts">
import type { ScheduleBuilderState, ScheduleConfig, ScheduleMode } from '~/types'

/**
 * Friendly schedule builder for a `core.cron` trigger. v-models the trigger's
 * `config` (a ScheduleConfig). All cron math lives on the server — this component
 * captures intent and previews it via POST /api/flows/preview-schedule, so the
 * client and scheduler never disagree on what a schedule means.
 */
const props = defineProps<{ modelValue: ScheduleConfig }>()
const emit = defineEmits<{ 'update:modelValue': [value: ScheduleConfig] }>()

const WEEKDAYS = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 }
]

const PRESET_ITEMS = [
  { label: 'Every N minutes / hours', value: 'interval' },
  { label: 'Every day at a time', value: 'daily' },
  { label: 'Certain weekdays at a time', value: 'weekly' },
  { label: 'A day each month at a time', value: 'monthly' },
  { label: 'Once at a specific time', value: 'at' },
  { label: 'Advanced (raw cron)', value: 'advanced' }
]

function resolveBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}
const browserTz = resolveBrowserTz()

function resolveTzItems(): string[] {
  try {
    const zones: string[] = Intl.supportedValuesOf?.('timeZone') ?? []
    return zones.length ? zones : [browserTz, 'UTC']
  } catch {
    return [browserTz, 'UTC']
  }
}
const tzItems = resolveTzItems()

// ---- local UI state, seeded from the persisted builder snapshot ----
const seed: ScheduleBuilderState = props.modelValue?.builder ?? {
  mode: 'cron',
  preset: 'interval',
  intervalEvery: 5,
  intervalUnit: 'minutes',
  timeOfDay: '09:00',
  weekdays: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  cron: props.modelValue?.cron ?? '*/5 * * * *',
  timezone: props.modelValue?.timezone ?? browserTz
}

const preset = ref<string>(seed.preset ?? 'interval')
const intervalEvery = ref<number>(seed.intervalEvery ?? 5)
const intervalUnit = ref<'minutes' | 'hours'>(seed.intervalUnit ?? 'minutes')
const timeOfDay = ref<string>(seed.timeOfDay ?? '09:00')
const weekdays = ref<number[]>(seed.weekdays ?? [1, 2, 3, 4, 5])
const dayOfMonth = ref<number>(seed.dayOfMonth ?? 1)
const atLocal = ref<string>(seed.atLocal ?? defaultAtLocal())
const cronText = ref<string>(seed.cron ?? '*/5 * * * *')
const timezone = ref<string>(seed.timezone ?? browserTz)

function defaultAtLocal(): string {
  // a datetime-local value ~1 hour out, in the browser's local wall clock
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toggleWeekday(d: number) {
  weekdays.value = weekdays.value.includes(d)
    ? weekdays.value.filter(x => x !== d)
    : [...weekdays.value, d].sort((a, b) => a - b)
}

// ---- compile local state -> canonical ScheduleConfig ----
function buildConfig(): ScheduleConfig {
  const [h = '0', m = '0'] = (timeOfDay.value || '09:00').split(':')
  let mode: ScheduleMode = 'cron'
  let cron: string | undefined
  let intervalMs: number | undefined
  let runAt: number | undefined

  switch (preset.value) {
    case 'interval': {
      mode = 'interval'
      const factor = intervalUnit.value === 'hours' ? 60 : 1
      intervalMs = Math.max(1, Math.floor(intervalEvery.value || 1)) * factor * 60_000
      break
    }
    case 'daily':
      cron = `${+m} ${+h} * * *`
      break
    case 'weekly': {
      const dow = (weekdays.value.length ? weekdays.value : [1, 2, 3, 4, 5]).join(',')
      cron = `${+m} ${+h} * * ${dow}`
      break
    }
    case 'monthly':
      cron = `${+m} ${+h} ${Math.min(31, Math.max(1, dayOfMonth.value || 1))} * *`
      break
    case 'at': {
      mode = 'at'
      const parsed = atLocal.value ? new Date(atLocal.value).getTime() : NaN
      runAt = Number.isFinite(parsed) ? parsed : undefined
      break
    }
    case 'advanced':
    default:
      cron = cronText.value.trim()
      break
  }

  const builder: ScheduleBuilderState = {
    mode,
    preset: preset.value,
    intervalEvery: intervalEvery.value,
    intervalUnit: intervalUnit.value,
    timeOfDay: timeOfDay.value,
    weekdays: weekdays.value,
    dayOfMonth: dayOfMonth.value,
    atLocal: atLocal.value,
    cron: cronText.value,
    timezone: timezone.value
  }

  return { mode, cron, intervalMs, runAt, timezone: timezone.value || null, builder }
}

// ---- live preview (server is the source of truth for the math) ----
const summary = ref('')
const previewError = ref<string | null>(null)
const nextRuns = ref<number[]>([])
let debounce: ReturnType<typeof setTimeout> | null = null

function emitAndPreview() {
  const config = buildConfig()
  emit('update:modelValue', config)
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => preview(config), 250)
}

async function preview(config: ScheduleConfig) {
  try {
    const res = await $fetch<{
      ok: boolean
      error: string | null
      summary: string
      nextRuns: number[]
    }>('/api/flows/preview-schedule', { method: 'POST', body: { config } })
    previewError.value = res.ok ? null : res.error
    summary.value = res.summary
    nextRuns.value = res.nextRuns ?? []
  } catch {
    previewError.value = 'Could not preview this schedule'
    nextRuns.value = []
  }
}

function fmt(epoch: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone.value || undefined,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(epoch))
  } catch {
    return new Date(epoch).toLocaleString()
  }
}

// react to every relevant input
watch([preset, intervalEvery, intervalUnit, timeOfDay, weekdays, dayOfMonth, atLocal, cronText, timezone], emitAndPreview, { deep: true })
onMounted(() => emitAndPreview())

const isAt = computed(() => preset.value === 'at')
</script>

<template>
  <div class="space-y-4">
    <UFormField label="How often?">
      <USelect
        v-model="preset"
        :items="PRESET_ITEMS"
        class="w-full"
      />
    </UFormField>

    <!-- interval -->
    <UFormField
      v-if="preset === 'interval'"
      label="Run every"
    >
      <div class="flex items-center gap-2">
        <UInputNumber
          v-model="intervalEvery"
          :min="1"
          class="w-28"
        />
        <USelect
          v-model="intervalUnit"
          :items="[{ label: 'minutes', value: 'minutes' }, { label: 'hours', value: 'hours' }]"
          class="w-32"
        />
      </div>
    </UFormField>

    <!-- daily / weekly / monthly all share a time-of-day -->
    <UFormField
      v-if="preset === 'daily' || preset === 'weekly' || preset === 'monthly'"
      label="At what time?"
    >
      <input
        v-model="timeOfDay"
        type="time"
        class="w-40 rounded-md border border-default bg-default px-3 py-1.5 text-sm"
      >
    </UFormField>

    <!-- weekly: which days -->
    <UFormField
      v-if="preset === 'weekly'"
      label="On which days?"
    >
      <div class="flex flex-wrap gap-1.5">
        <UButton
          v-for="d in WEEKDAYS"
          :key="d.value"
          size="xs"
          :color="weekdays.includes(d.value) ? 'primary' : 'neutral'"
          :variant="weekdays.includes(d.value) ? 'solid' : 'outline'"
          @click="toggleWeekday(d.value)"
        >
          {{ d.label }}
        </UButton>
      </div>
    </UFormField>

    <!-- monthly: day of month -->
    <UFormField
      v-if="preset === 'monthly'"
      label="On which day of the month?"
    >
      <UInputNumber
        v-model="dayOfMonth"
        :min="1"
        :max="31"
        class="w-28"
      />
    </UFormField>

    <!-- one-time -->
    <UFormField
      v-if="preset === 'at'"
      label="Run once at"
      description="Interpreted in the timezone below. The flow disables itself after it runs."
    >
      <input
        v-model="atLocal"
        type="datetime-local"
        class="w-64 rounded-md border border-default bg-default px-3 py-1.5 text-sm"
      >
    </UFormField>

    <!-- advanced -->
    <UFormField
      v-if="preset === 'advanced'"
      label="Cron expression"
      description="Five fields: minute hour day month weekday. Example: */5 * * * * = every 5 minutes."
    >
      <UInput
        v-model="cronText"
        placeholder="*/5 * * * *"
        class="w-full font-mono"
      />
    </UFormField>

    <!-- timezone (applies to all recurring + one-time) -->
    <UFormField
      label="Timezone"
      :description="isAt ? 'The date/time above is read in this zone.' : 'The schedule fires on this zone\'s wall clock (DST-aware).'"
    >
      <USelectMenu
        v-model="timezone"
        :items="tzItems"
        searchable
        class="w-full max-w-sm"
      />
    </UFormField>

    <!-- live preview -->
    <UAlert
      v-if="previewError"
      color="error"
      variant="subtle"
      :title="previewError"
      icon="i-lucide-triangle-alert"
    />
    <div
      v-else
      class="rounded-md border border-default bg-elevated/50 p-3 text-sm"
    >
      <div class="flex items-center gap-2 font-medium text-highlighted">
        <UIcon
          name="i-lucide-calendar-clock"
          class="size-4 text-primary"
        />
        {{ summary || 'Configuring…' }}
      </div>
      <div
        v-if="nextRuns.length"
        class="mt-2 text-muted"
      >
        Next: {{ nextRuns.map(fmt).join(' · ') }}
      </div>
      <div
        v-else-if="summary"
        class="mt-2 text-muted"
      >
        No upcoming runs.
      </div>
    </div>
  </div>
</template>
