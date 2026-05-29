<script setup lang="ts">
import type { Connection, Monitor } from '~/types'

/**
 * Monitoring page. Lists "monitors" — a monitorable connection (any integration
 * that declares a `monitoring` capability, e.g. Dokploy or Uptime Kuma) plus a
 * per-target config. Each monitor is snapshotted by MonitorCard.
 *
 * Adding a monitor:
 *  - Dokploy gets a rich path: pick a server, the metrics URL/token auto-fill.
 *  - Every other integration renders its monitoring.targetSchema via SchemaForm.
 */
const { data: monitors, refresh } = await useFetch<Monitor[]>('/api/monitors', {
  key: 'monitors',
  default: () => []
})
const { data: connections } = await useFetch<Connection[]>('/api/connections', {
  key: 'connections',
  default: () => []
})
const { data: catalog } = useCatalog()
const toast = useToast()

// connections whose integration can be monitored
const monitorableConns = computed(() =>
  connections.value.filter(c => findIntegration(catalog.value, c.integrationId)?.monitoring)
)
function integrationFor(c: Connection | undefined) {
  return c ? findIntegration(catalog.value, c.integrationId) : undefined
}

const open = ref(false)
const editing = ref<Monitor | null>(null)
const form = reactive({
  connectionId: '',
  name: '',
  targetConfig: {} as Record<string, unknown>,
  publicVisible: false
})
const saving = ref(false)
const testing = ref(false)

const selectedConn = computed(() => connections.value.find(c => c.id === form.connectionId))
const selectedIntegration = computed(() => integrationFor(selectedConn.value))
const isDokploy = computed(() => selectedConn.value?.integrationId === 'dokploy')
const isKuma = computed(() => selectedConn.value?.integrationId === 'kuma')
const targetSchema = computed(() => selectedIntegration.value?.monitoring?.targetSchema ?? [])
// non-secret, non-Dokploy/Kuma-internal fields are surfaced via SchemaForm;
// Dokploy hides metricsUrl/token/serverId behind the server picker, and Kuma
// hides the monitor name behind the multi-select below.
const formSchema = computed(() =>
  isDokploy.value || isKuma.value ? [] : targetSchema.value
)

// ── Dokploy auto-discovery ────────────────────────────────────────────────
interface DokployServer {
  serverId: string
  name: string
  ipAddress: string | null
  metricsToken: string | null
  metricsUrl: string | null
}
interface MonitoringInfo {
  monitoringEnabled: boolean
  metricsToken: string | null
  defaultMetricsUrl: string
  servers: DokployServer[]
  suggestion: { metricsUrl: string, metricsToken: string | null }
}
const discovering = ref(false)
const enabling = ref(false)
const dokployInfo = ref<MonitoringInfo | null>(null)
const autoFilled = ref(false)
const serverId = ref('')

const HOST = '__host__'
const serverItems = computed(() => [
  { label: 'The Dokploy host itself', value: HOST },
  ...(dokployInfo.value?.servers ?? []).map(s => ({ label: s.name, value: s.serverId }))
])
const serverSelection = computed({
  get: () => serverId.value || HOST,
  set: (v: string) => { serverId.value = v === HOST ? '' : v }
})

const machineMonitors = computed(() => monitors.value.filter(m => m.integrationId === 'dokploy'))
const uptimeMonitors = computed(() => monitors.value.filter(m => m.integrationId === 'kuma'))

async function discover(connectionId: string) {
  dokployInfo.value = null
  autoFilled.value = false
  if (!connectionId || !isDokploy.value) return
  discovering.value = true
  try {
    dokployInfo.value = await $fetch<MonitoringInfo>(`/api/connections/${connectionId}/dokploy-monitoring`)
    applyServerDefaults()
    autoFilled.value = !!(form.targetConfig.metricsUrl && form.targetConfig.metricsToken)
  } catch {
    // discovery failed — user can fill manually
  } finally {
    discovering.value = false
  }
}

function applyServerDefaults() {
  const info = dokployInfo.value
  if (!info) return
  const srv = info.servers.find(s => s.serverId === serverId.value)
  if (srv) {
    form.targetConfig.metricsUrl = srv.metricsUrl || info.defaultMetricsUrl
    form.targetConfig.metricsToken = srv.metricsToken || info.metricsToken || ''
    if (!form.name) form.name = srv.name
  } else {
    form.targetConfig.metricsUrl = info.suggestion.metricsUrl
    form.targetConfig.metricsToken = info.suggestion.metricsToken || ''
  }
  form.targetConfig.serverId = serverId.value
}
watch(serverId, applyServerDefaults)

// Ask Dokploy to configure + deploy the monitoring agent for the selected
// target (host or remote server) via the API, then auto-fill from the result.
async function enableMonitoring() {
  if (!form.connectionId || !isDokploy.value) return
  enabling.value = true
  try {
    dokployInfo.value = await $fetch<MonitoringInfo>(`/api/connections/${form.connectionId}/dokploy-monitoring`, {
      method: 'POST',
      body: { serverId: serverId.value }
    })
    applyServerDefaults()
    autoFilled.value = !!(form.targetConfig.metricsUrl && form.targetConfig.metricsToken)
    toast.add(
      autoFilled.value
        ? { title: 'Monitoring enabled', description: 'Dokploy configured the agent and the URL + token were filled in.', color: 'success' }
        : { title: 'Monitoring enabled', description: 'The agent may take a moment to come up — reopen this dialog if the token is missing.', color: 'warning' }
    )
  } catch (e: unknown) {
    toast.add({ title: 'Couldn\'t enable monitoring', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Dokploy rejected the request', color: 'error' })
  } finally {
    enabling.value = false
  }
}

// ── Kuma auto-discovery ───────────────────────────────────────────────────
interface KumaMonitor { name: string, group: string | null, status: number }
const kumaMonitors = ref<KumaMonitor[]>([])
// names of the monitors picked in the multi-select (Add mode only)
const selectedKuma = ref<string[]>([])

// monitors ordered by group (ungrouped last), then by name — so a selection
// spanning groups stays grouped. Drives both the picker and what we create.
const kumaSorted = computed(() =>
  [...kumaMonitors.value].sort((a, b) => {
    // ungrouped monitors sort last, then by group, then by name
    if (!a.group !== !b.group) return a.group ? -1 : 1
    return (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name)
  })
)
const SELECT_ALL = '__all__'
const kumaItems = computed(() => {
  const items: Array<{ label: string, value: string, group?: string }> = []
  if (kumaSorted.value.length) {
    items.push({ label: `Select all (${kumaSorted.value.length})`, value: SELECT_ALL })
  }
  for (const m of kumaSorted.value) {
    items.push({ label: m.group ? `${m.group} · ${m.name}` : m.name, value: m.name, group: m.group ?? undefined })
  }
  return items
})
const allKumaSelected = computed(() =>
  kumaSorted.value.length > 0 && selectedKuma.value.length === kumaSorted.value.length
)
// intercept the "Select all" pseudo-item: toggle every real monitor.
const kumaSelection = computed({
  get: () => selectedKuma.value,
  set: (vals: string[]) => {
    if (vals.includes(SELECT_ALL)) {
      selectedKuma.value = allKumaSelected.value ? [] : kumaSorted.value.map(m => m.name)
    } else {
      selectedKuma.value = vals.filter(v => v !== SELECT_ALL)
    }
  }
})

async function discoverKuma(connectionId: string) {
  kumaMonitors.value = []
  selectedKuma.value = []
  if (!connectionId || !isKuma.value) return
  discovering.value = true
  try {
    const res = await $fetch<{ monitors: KumaMonitor[] }>(`/api/connections/${connectionId}/kuma-monitors`)
    kumaMonitors.value = res.monitors
  } catch {
    // discovery failed — user can still add manually via the name field
  } finally {
    discovering.value = false
  }
}

// ── open / edit ───────────────────────────────────────────────────────────
function resetForm(connectionId: string) {
  form.connectionId = connectionId
  form.name = ''
  form.targetConfig = {}
  form.publicVisible = false
  serverId.value = ''
  dokployInfo.value = null
  autoFilled.value = false
  kumaMonitors.value = []
  selectedKuma.value = []
}

// run the right auto-discovery for the selected connection (Add mode only)
function discoverFor(connectionId: string) {
  if (isKuma.value) discoverKuma(connectionId)
  else discover(connectionId)
}

function openAdd() {
  editing.value = null
  resetForm(monitorableConns.value[0]?.id ?? '')
  open.value = true
  // defer reactive writes from discovery until the modal subtree is mounted
  nextTick(() => {
    if (open.value && !editing.value) discoverFor(form.connectionId)
  })
}
function openEdit(m: Monitor) {
  editing.value = m
  form.connectionId = m.connectionId
  form.name = m.name
  form.targetConfig = { ...m.targetConfig }
  form.publicVisible = m.publicVisible
  serverId.value = String(m.targetConfig.serverId ?? '')
  dokployInfo.value = null
  autoFilled.value = false
  kumaMonitors.value = []
  selectedKuma.value = []
  open.value = true
}

// re-discover when the connection changes in the Add form
watch(() => form.connectionId, (id) => {
  if (open.value && !editing.value) {
    form.targetConfig = {}
    serverId.value = ''
    kumaMonitors.value = []
    selectedKuma.value = []
    discoverFor(id)
  }
})

async function test() {
  testing.value = true
  try {
    const res = await $fetch<{ ok: boolean, message: string }>('/api/monitors/test', {
      method: 'POST',
      body: { connectionId: form.connectionId, targetConfig: form.targetConfig, monitorId: editing.value?.id }
    })
    toast.add({
      title: res.ok ? 'Monitor reachable' : 'Test failed',
      description: res.message,
      color: res.ok ? 'success' : 'error'
    })
  } catch (e: unknown) {
    toast.add({ title: 'Test failed', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not reach the target', color: 'error' })
  } finally {
    testing.value = false
  }
}

// bulk-add the selected Kuma monitors, one monitor row each, in grouped order.
async function saveKuma() {
  const picked = kumaSorted.value.filter(m => selectedKuma.value.includes(m.name))
  if (!picked.length) {
    toast.add({ title: 'Pick at least one monitor', color: 'warning' })
    return
  }
  saving.value = true
  try {
    for (const m of picked) {
      await $fetch('/api/monitors', {
        method: 'POST',
        // persist the group alongside the name so the card can show/group it
        body: {
          connectionId: form.connectionId,
          name: m.name,
          targetConfig: { monitor: m.name, group: m.group ?? null },
          publicVisible: form.publicVisible
        }
      })
    }
    open.value = false
    await refresh()
    toast.add({ title: `Added ${picked.length} monitor${picked.length === 1 ? '' : 's'}`, color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function save() {
  if (isKuma.value && !editing.value) return saveKuma()
  if (!form.name.trim()) {
    toast.add({ title: 'Give the monitor a name', color: 'warning' })
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await $fetch(`/api/monitors/${editing.value.id}`, {
        method: 'PUT',
        body: { name: form.name, targetConfig: form.targetConfig, publicVisible: form.publicVisible }
      })
    } else {
      await $fetch('/api/monitors', {
        method: 'POST',
        body: {
          connectionId: form.connectionId,
          name: form.name,
          targetConfig: form.targetConfig,
          publicVisible: form.publicVisible
        }
      })
    }
    open.value = false
    await refresh()
    toast.add({ title: 'Monitor saved', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed', color: 'error' })
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<Monitor | null>(null)
const detailTarget = ref<Monitor | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  await $fetch(`/api/monitors/${deleteTarget.value.id}`, { method: 'DELETE' })
  deleteTarget.value = null
  await refresh()
}

const connItems = computed(() => monitorableConns.value.map(c => ({
  label: `${c.name} · ${integrationFor(c)?.name ?? c.integrationId}`,
  value: c.id
})))
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          Monitoring
        </h1>
        <p class="mt-1 text-sm text-muted">
          Live health for anything you can connect — server metrics from Dokploy, uptime from Kuma, and more.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Add monitor"
        class="self-start"
        :disabled="monitorableConns.length === 0"
        @click="openAdd"
      />
    </div>

    <UAlert
      v-if="monitorableConns.length === 0"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      title="Add a monitorable connection first"
      description="Connect a service that supports monitoring (e.g. Dokploy or Uptime Kuma) on the Connections page, then add a monitor here."
      class="mb-6"
    />

    <div
      v-if="monitors.length === 0"
      class="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-default py-20 text-center"
    >
      <span class="flex size-12 items-center justify-center rounded-2xl bg-elevated text-dimmed">
        <UIcon
          name="i-lucide-activity"
          class="size-6"
        />
      </span>
      <p class="text-sm text-muted">
        No monitors yet.
      </p>
    </div>

    <div
      v-else
      class="flex flex-col gap-6"
    >
      <div
        v-if="machineMonitors.length > 0"
        class="flex flex-col gap-3"
      >
        <h2 class="text-base font-semibold tracking-tight text-highlighted">
          Machines
        </h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MonitorCard
            v-for="m in machineMonitors"
            :key="m.id"
            :monitor="m"
            :icon="findIntegration(catalog, m.integrationId)?.icon"
            :img="findIntegration(catalog, m.integrationId)?.img"
            @edit="openEdit(m)"
            @remove="deleteTarget = m"
            @open="detailTarget = m"
          />
        </div>
      </div>

      <div
        v-if="uptimeMonitors.length > 0"
        class="flex flex-col gap-3"
      >
        <h2 class="text-base font-semibold tracking-tight text-highlighted">
          Uptime Kuma
        </h2>
        <div class="flex flex-col gap-2">
          <!-- <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"> -->
          <MonitorCard
            v-for="m in uptimeMonitors"
            :key="m.id"
            :monitor="m"
            :icon="findIntegration(catalog, m.integrationId)?.icon"
            :img="findIntegration(catalog, m.integrationId)?.img"
            @edit="openEdit(m)"
            @remove="deleteTarget = m"
            @open="detailTarget = m"
          />
        </div>
      </div>
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? 'Edit monitor' : 'Add monitor'"
      :description="isDokploy ? 'Pick which server to monitor — the monitoring URL and token are fetched from Dokploy automatically.' : isKuma && !editing ? 'Pick the monitors to watch — they\'re discovered from Uptime Kuma automatically.' : 'Choose a connection and what to watch.'"
      :ui="{ footer: 'flex-wrap justify-between gap-2' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Connection"
            required
          >
            <USelect
              v-model="form.connectionId"
              :items="connItems"
              :disabled="!!editing"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="!(isKuma && !editing)"
            label="Name"
            required
          >
            <UInput
              v-model="form.name"
              placeholder="my-server"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Public on shared boards"
            description="Allow this monitor's live snapshot to appear on public boards that include it. Turn it off to keep the public placeholder instead."
          >
            <USwitch v-model="form.publicVisible" />
          </UFormField>

          <!-- Dokploy: server picker + auto-discovery -->
          <template v-if="isDokploy">
            <UFormField
              v-if="!editing"
              label="Server to monitor"
              :description="discovering ? 'Loading servers from Dokploy…' : 'The monitoring URL + token are filled in automatically.'"
            >
              <USelect
                v-model="serverSelection"
                :items="serverItems"
                :loading="discovering"
                class="w-full"
              />
            </UFormField>

            <UAlert
              v-if="autoFilled && !editing"
              color="success"
              variant="soft"
              icon="i-lucide-check-circle"
              title="Monitoring configured automatically"
              description="The monitoring URL and token were fetched from Dokploy."
            />
            <UAlert
              v-else-if="!editing && dokployInfo && !dokployInfo.monitoringEnabled"
              color="warning"
              variant="soft"
              icon="i-lucide-alert-triangle"
              title="Monitoring isn't enabled in Dokploy"
              description="We can configure and deploy the monitoring agent for this target with sensible defaults, or you can turn it on yourself in Dokploy (Settings → Monitoring) and reopen this dialog."
            >
              <template #actions>
                <UButton
                  label="Enable monitoring"
                  icon="i-lucide-zap"
                  color="warning"
                  size="sm"
                  :loading="enabling"
                  @click="enableMonitoring"
                />
              </template>
            </UAlert>
            <UAlert
              v-else-if="!editing && dokployInfo && !autoFilled"
              color="warning"
              variant="soft"
              icon="i-lucide-alert-triangle"
              title="Couldn't auto-fill monitoring"
              description="No token was found for this server."
            />
          </template>

          <!-- Uptime Kuma: multi-select of auto-discovered monitors -->
          <template v-else-if="isKuma && !editing">
            <UFormField
              label="Monitors to watch"
              required
              :description="discovering ? 'Loading monitors from Uptime Kuma…' : 'Pick one or more — monitors across groups are added grouped together.'"
            >
              <USelectMenu
                v-model="kumaSelection"
                :items="kumaItems"
                value-key="value"
                multiple
                :loading="discovering"
                :search-input="{ placeholder: 'Filter monitors…' }"
                placeholder="Select monitors"
                class="w-full"
              />
            </UFormField>

            <p
              v-if="selectedKuma.length"
              class="text-sm text-muted"
            >
              {{ selectedKuma.length }} monitor{{ selectedKuma.length === 1 ? '' : 's' }} selected.
            </p>
            <UAlert
              v-else-if="!discovering && kumaMonitors.length === 0"
              color="warning"
              variant="soft"
              icon="i-lucide-alert-triangle"
              title="No monitors found"
              description="Uptime Kuma didn't report any monitors on its /metrics endpoint. Check the connection's API key has metrics access."
            />
          </template>

          <!-- Everything else: schema-driven target fields -->
          <SchemaForm
            v-else-if="formSchema.length"
            v-model="form.targetConfig"
            :schema="formSchema"
          />
        </div>
      </template>
      <template #footer="{ close }">
        <UButton
          v-if="!(isKuma && !editing)"
          label="Test"
          icon="i-lucide-plug-zap"
          color="neutral"
          variant="outline"
          :loading="testing"
          :disabled="!form.connectionId"
          @click="test"
        />
        <div
          v-else
          class="flex-1"
        />
        <div class="flex items-center gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="close"
          />
          <UButton
            :label="editing ? 'Save' : isKuma ? (selectedKuma.length > 1 ? `Add ${selectedKuma.length} monitors` : 'Add') : 'Add'"
            :loading="saving"
            :disabled="isKuma && !editing && selectedKuma.length === 0"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Remove monitor?"
      :ui="{ footer: 'justify-end' }"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="deleteTarget = null"
        />
        <UButton
          label="Remove"
          color="error"
          @click="confirmDelete"
        />
      </template>
    </UModal>

    <USlideover
      :open="!!detailTarget"
      :title="detailTarget?.name"
      description="Live data — refreshes automatically"
      @update:open="(v) => { if (!v) detailTarget = null }"
    >
      <template #body>
        <MonitorDetail
          v-if="detailTarget"
          :key="detailTarget.id"
          :monitor="detailTarget"
        />
      </template>
    </USlideover>
  </UContainer>
</template>
