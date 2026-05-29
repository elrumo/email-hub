<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { errorMessage, type Mapping } from '~/composables/useStatus'

const props = defineProps<{
  existing?: Mapping | null
}>()
const emit = defineEmits<{
  (e: 'close' | 'saved'): void
}>()

const isEdit = computed(() => !!props.existing)
const title = computed(() => (isEdit.value ? 'Edit Mapping' : 'New Mapping'))

// UModal is driven by an internal open ref; the parent mounts/unmounts us via
// v-if, so we start open and emit `close` when it closes.
const open = ref(true)
function onOpenChange(value: boolean) {
  if (!value) emit('close')
}

// form state
const state = reactive({
  fqdn: props.existing?.fqdn ?? '',
  kumaMonitor: props.existing?.kumaMonitor ?? '',
  bunnyZoneId: (props.existing?.bunnyZoneId ?? null) as number | null,
  recordName: props.existing?.recordName ?? '',
  ips: (props.existing?.ips && props.existing.ips.length > 0
    ? [...props.existing.ips]
    : ['', '']) as string[],
  healthPath: props.existing?.healthPath ?? '/'
})

const saving = ref(false)
const error = ref<string | null>(null)

const FQDN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/

function isValidIp(s: string) {
  if (!IPV4_RE.test(s)) return false
  return s.split('.').map(Number).every(o => o >= 0 && o <= 255)
}

const fqdnError = computed(() =>
  state.fqdn && !FQDN_RE.test(state.fqdn) ? 'That doesn\'t look like a valid hostname' : undefined
)
function ipError(ip: string) {
  return ip && !isValidIp(ip) ? 'Invalid IPv4 address' : undefined
}

// bunny zone/record lookup
const resolving = ref(false)
const resolved = ref(isEdit.value) // edits start "resolved" — zone/record already known
const resolveError = ref<string | null>(null)
const zoneARecords = ref<Array<{ name: string, value: string, disabled: boolean }>>([])

// A records in the resolved zone that match the current record name. These are
// the real origins behind the hostname — the primary way to choose IPs.
const matchingARecords = computed(() => {
  const want = state.recordName === '@' ? '' : state.recordName
  return zoneARecords.value.filter(r => (r.name || '') === want)
})

// When there are real A-records to choose from, the checklist is the primary UI;
// manual IP entry is an explicit fallback the user opts into.
const manualMode = ref(false)
const useChecklist = computed(() => matchingARecords.value.length > 0 && !manualMode.value)

async function lookup() {
  if (!state.fqdn || fqdnError.value) return
  resolving.value = true
  resolveError.value = null
  try {
    const res = await fetch(`/api/bunny/resolve?fqdn=${encodeURIComponent(state.fqdn.toLowerCase())}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.statusMessage || data.message || res.statusText)
    }
    const data = await res.json()
    state.bunnyZoneId = data.zoneId
    state.recordName = data.recordName
    zoneARecords.value = data.aRecords
    resolved.value = true
    manualMode.value = false
    // Pre-select every matching A-record so the common case is one tap away.
    if (matchingARecords.value.length && !isEdit.value) {
      state.ips = matchingARecords.value.map(r => r.value)
      if (state.ips.length < 2) state.ips = [...state.ips, ...Array(2 - state.ips.length).fill('')]
    }
  } catch (e: any) {
    resolveError.value = e.message || 'lookup failed'
    zoneARecords.value = []
    resolved.value = false
  } finally {
    resolving.value = false
  }
}

const selectedRecordIps = computed(() =>
  matchingARecords.value
    .map(r => r.value)
    .filter(v => state.ips.includes(v))
)

function toggleIp(value: string) {
  const i = state.ips.indexOf(value)
  if (i !== -1) {
    state.ips.splice(i, 1)
    return
  }
  state.ips.push(value)
}

// Switch from the A-record checklist to manual entry, seeding the manual rows
// with whatever is already selected so nothing is lost.
function switchToManual() {
  const seed = state.ips.filter(Boolean)
  while (seed.length < 2) seed.push('')
  state.ips = seed
  manualMode.value = true
}

// --- kuma monitor select (preloaded, client-side filter) ---
const kumaMonitors = ref<string[]>([])
onMounted(async () => {
  try {
    const res = await fetch('/api/kuma/monitors')
    if (res.ok) kumaMonitors.value = (await res.json()).monitors ?? []
  } catch { /* leave empty; field still accepts a typed value */ }
})

// --- hostname select (server-side search as you type) ---
interface HostnameHit { fqdn: string, zoneId: number, recordName: string }
const hostnameHits = ref<HostnameHit[]>([])
const hostnameItems = computed(() => hostnameHits.value.map(h => h.fqdn))
const hostnameSearching = ref(false)
let hostnameTimer: ReturnType<typeof setTimeout> | null = null

function onHostnameSearch(term: string) {
  if (hostnameTimer) clearTimeout(hostnameTimer)
  const q = term.trim()
  if (q.length < 2) {
    hostnameHits.value = []
    return
  }
  hostnameTimer = setTimeout(async () => {
    hostnameSearching.value = true
    try {
      const res = await fetch(`/api/bunny/hostnames?q=${encodeURIComponent(q)}`)
      hostnameHits.value = res.ok ? (await res.json()).hostnames ?? [] : []
    } catch {
      hostnameHits.value = []
    } finally {
      hostnameSearching.value = false
    }
  }, 300)
}

// When a hostname is picked, autofill zone + record from the hit (if known)
// and pull the zone's A records for the IP picker.
async function onHostnameChange(value: string) {
  state.fqdn = value
  const hit = hostnameHits.value.find(h => h.fqdn === value)
  if (hit) {
    state.bunnyZoneId = hit.zoneId
    state.recordName = hit.recordName
  }
  if (value && !fqdnError.value) await lookup()
}

// The set of IPs we'll actually submit: filled-in rows only.
const effectiveIps = computed(() => state.ips.filter(Boolean))

const canSubmit = computed(() => {
  if (!state.fqdn || !FQDN_RE.test(state.fqdn)) return false
  if (!state.kumaMonitor.trim()) return false
  if (!state.bunnyZoneId || state.bunnyZoneId <= 0) return false
  if (!state.recordName) return false
  if (effectiveIps.value.length < 2) return false
  if (!effectiveIps.value.every(isValidIp)) return false
  if (new Set(effectiveIps.value).size !== effectiveIps.value.length) return false
  if (state.healthPath && !state.healthPath.startsWith('/')) return false
  return true
})

function addIp() {
  state.ips.push('')
}
function removeIp(i: number) {
  if (state.ips.length <= 2) return
  state.ips.splice(i, 1)
}

async function save() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = null
  const body = {
    fqdn: state.fqdn.toLowerCase(),
    kumaMonitor: state.kumaMonitor.trim(),
    bunnyZoneId: state.bunnyZoneId,
    recordName: state.recordName,
    ips: effectiveIps.value,
    ...(state.healthPath && state.healthPath !== '/'
      ? { healthPath: state.healthPath }
      : {})
  }
  try {
    const url = isEdit.value
      ? `/api/mappings/${encodeURIComponent(props.existing!.fqdn)}`
      : '/api/mappings'
    const method = isEdit.value ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.statusMessage || data.message || res.statusText)
    }
    emit('saved')
  } catch (e) {
    error.value = errorMessage(e, 'save failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="isEdit
      ? 'Update which origins this hostname fails over between, and how its health is checked.'
      : 'Watch a hostname and automatically steer its DNS to a healthy origin when one goes down.'"
    :ui="{ content: 'max-w-xl', footer: 'justify-between gap-3' }"
    @update:open="onOpenChange"
  >
    <template #body>
      <form
        id="mapping-form"
        class="space-y-7"
        @submit.prevent="save"
      >
        <!-- ───────────── Step 1 · Hostname ───────────── -->
        <section class="space-y-3">
          <div class="flex items-center gap-2.5">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              :class="resolved ? 'bg-success/15 text-success' : 'bg-primary text-inverted'"
            >
              <UIcon
                v-if="resolved"
                name="i-lucide-check"
                class="size-3.5"
              />
              <template v-else>1</template>
            </span>
            <div>
              <h4 class="text-sm font-semibold text-highlighted">
                Which hostname?
              </h4>
              <p class="text-xs text-muted">
                The domain Dokploy Doctor will watch and steer.
              </p>
            </div>
          </div>

          <div class="pl-8.5 space-y-2">
            <UFormField :error="fqdnError">
              <USelectMenu
                :model-value="state.fqdn"
                :items="hostnameItems"
                :loading="hostnameSearching || resolving"
                ignore-filter
                create-item="always"
                icon="i-lucide-globe"
                placeholder="Search Bunny DNS or type api.macosicons.com"
                class="w-full"
                :disabled="isEdit"
                :search-input="{ placeholder: 'Type at least 2 characters…' }"
                @update:model-value="onHostnameChange"
                @update:search-term="onHostnameSearch"
              />
            </UFormField>

            <!-- DNS resolution feedback -->
            <div
              v-if="resolving"
              class="flex items-center gap-2 text-xs text-muted"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-3.5 animate-spin"
              />
              Looking this hostname up in Bunny DNS…
            </div>
            <div
              v-else-if="resolveError"
              class="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              <UIcon
                name="i-lucide-triangle-alert"
                class="mt-px size-3.5 shrink-0"
              />
              <span>Couldn't auto-resolve DNS ({{ resolveError }}). You can still fill in the details manually below.</span>
            </div>
            <div
              v-else-if="resolved && state.bunnyZoneId"
              class="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success"
            >
              <UIcon
                name="i-lucide-circle-check"
                class="size-3.5 shrink-0"
              />
              <span>
                Found in Bunny DNS — record
                <span class="font-mono font-medium">{{ state.recordName || '@' }}</span>
                in zone <span class="font-mono font-medium">{{ state.bunnyZoneId }}</span>.
              </span>
            </div>

            <!-- Manual zone/record fallback, shown only when DNS didn't resolve -->
            <div
              v-if="resolveError || (state.fqdn && !resolved && !resolving)"
              class="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2"
            >
              <UFormField
                label="Bunny Zone ID"
                help="Visible in the Bunny dashboard URL"
              >
                <UInput
                  v-model.number="state.bunnyZoneId"
                  type="number"
                  :min="1"
                  placeholder="12345"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Record Name"
                help="Subdomain, or @ for apex"
              >
                <UInput
                  v-model="state.recordName"
                  placeholder="api"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </section>

        <!-- ───────────── Step 2 · Origins ───────────── -->
        <section
          class="space-y-3 transition-opacity"
          :class="{ 'pointer-events-none opacity-40': !state.fqdn || !!fqdnError }"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              :class="effectiveIps.length >= 2 ? 'bg-success/15 text-success' : 'bg-elevated text-muted'"
            >
              <UIcon
                v-if="effectiveIps.length >= 2"
                name="i-lucide-check"
                class="size-3.5"
              />
              <template v-else>2</template>
            </span>
            <div>
              <h4 class="text-sm font-semibold text-highlighted">
                Which origins should it fail over between?
              </h4>
              <p class="text-xs text-muted">
                Pick at least two. The DNS record is steered to whichever is healthy.
              </p>
            </div>
          </div>

          <div class="pl-8.5 space-y-2">
            <!-- Primary: pick from the real A-records behind this hostname -->
            <template v-if="useChecklist">
              <button
                v-for="r in matchingARecords"
                :key="r.value"
                type="button"
                class="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left ring-1 ring-inset transition-colors"
                :class="state.ips.includes(r.value)
                  ? 'bg-primary/10 ring-primary/40'
                  : 'ring-default hover:bg-elevated'"
                @click="toggleIp(r.value)"
              >
                <UIcon
                  :name="state.ips.includes(r.value) ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
                  class="size-5 shrink-0"
                  :class="state.ips.includes(r.value) ? 'text-primary' : 'text-dimmed'"
                />
                <span class="flex-1 font-mono text-sm tabular-nums text-highlighted">{{ r.value }}</span>
                <UBadge
                  v-if="r.disabled"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  label="Disabled in DNS"
                />
                <UBadge
                  v-else
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  label="A record"
                />
              </button>

              <div class="flex items-center justify-between pt-1">
                <p
                  class="text-xs"
                  :class="selectedRecordIps.length >= 2 ? 'text-muted' : 'text-dimmed'"
                >
                  {{ selectedRecordIps.length }} selected
                  <span v-if="selectedRecordIps.length < 2"> · choose at least 2</span>
                </p>
                <UButton
                  label="Enter IPs manually"
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="link"
                  size="xs"
                  @click="switchToManual"
                />
              </div>
            </template>

            <!-- Fallback: type IPs by hand -->
            <template v-else>
              <div
                v-for="(ip, i) in state.ips"
                :key="i"
                class="flex gap-2"
              >
                <UInput
                  v-model="state.ips[i]"
                  placeholder="203.0.113.10"
                  :color="ipError(ip) ? 'error' : undefined"
                  icon="i-lucide-server"
                  class="flex-1 font-mono tabular-nums"
                />
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  square
                  :disabled="state.ips.length <= 2"
                  aria-label="Remove IP"
                  @click="removeIp(i)"
                />
              </div>
              <div class="flex items-center justify-between pt-0.5">
                <UButton
                  label="Add another IP"
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="link"
                  size="xs"
                  @click="addIp"
                />
                <UButton
                  v-if="matchingARecords.length"
                  label="Pick from DNS records"
                  icon="i-lucide-list"
                  color="neutral"
                  variant="link"
                  size="xs"
                  @click="manualMode = false"
                />
              </div>
              <p class="text-xs text-dimmed">
                Each IP must already exist as an A record in the Bunny zone.
              </p>
            </template>
          </div>
        </section>

        <!-- ───────────── Step 3 · Health monitoring ───────────── -->
        <section
          class="space-y-3 transition-opacity"
          :class="{ 'pointer-events-none opacity-40': effectiveIps.length < 2 }"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              :class="state.kumaMonitor.trim() ? 'bg-success/15 text-success' : 'bg-elevated text-muted'"
            >
              <UIcon
                v-if="state.kumaMonitor.trim()"
                name="i-lucide-check"
                class="size-3.5"
              />
              <template v-else>3</template>
            </span>
            <div>
              <h4 class="text-sm font-semibold text-highlighted">
                How is its health checked?
              </h4>
              <p class="text-xs text-muted">
                The Uptime Kuma monitor that tells us when to fail over.
              </p>
            </div>
          </div>

          <div class="pl-8.5 space-y-3">
            <UFormField
              label="Uptime Kuma monitor"
              help="Pick from Kuma's monitors, or type a custom name"
            >
              <USelectMenu
                v-model="state.kumaMonitor"
                :items="kumaMonitors"
                create-item="always"
                icon="i-lucide-activity"
                placeholder="API macOSicons"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Health probe path"
              help="Path we GET to confirm an origin is alive before switching to it"
            >
              <UInput
                v-model="state.healthPath"
                placeholder="/"
                icon="i-lucide-route"
                class="w-full font-mono"
              />
            </UFormField>
          </div>
        </section>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="error"
        />
      </form>
    </template>

    <template #footer="{ close }">
      <p class="text-xs text-dimmed">
        <template v-if="!canSubmit">
          <span v-if="!state.fqdn || fqdnError">Start by choosing a hostname</span>
          <span v-else-if="effectiveIps.length < 2">Pick at least 2 origins</span>
          <span v-else-if="!state.kumaMonitor.trim()">Choose a Kuma monitor</span>
          <span v-else>Fill in the remaining fields</span>
        </template>
        <span
          v-else
          class="flex items-center gap-1.5 text-success"
        >
          <UIcon
            name="i-lucide-check"
            class="size-3.5"
          />
          Ready to save
        </span>
      </p>
      <div class="flex items-center gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <UButton
          type="submit"
          form="mapping-form"
          :label="isEdit ? 'Save Changes' : 'Add Mapping'"
          :loading="saving"
          :disabled="!canSubmit"
        />
      </div>
    </template>
  </UModal>
</template>
