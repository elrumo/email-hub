<script setup lang="ts">
import type { Connection, IntegrationMeta } from '~/types'

const { data: catalog } = useCatalog()
const { data: connections, refresh } = await useFetch<Connection[]>('/api/connections', {
  key: 'connections',
  default: () => []
})

// Installed user connectors (custom integrations imported from an OpenAPI spec).
// Listed + managed in their own section further down the page.
interface ConnectorRow {
  id: string
  connectorId: string
  name: string
  enabled: boolean
  version?: string
  actionCount: number
}
const { data: userConnectors, refresh: refreshConnectors } = await useFetch<ConnectorRow[]>('/api/connectors', {
  key: 'connectors',
  default: () => []
})

const toast = useToast()

// Sentinel value for the "Import from OpenAPI…" entry appended to the Service
// dropdown. Selecting it opens the import modal instead of choosing a service.
const IMPORT_OPTION = '__import_connector__'
const importOpen = ref(false)

// editor modal state
const open = ref(false)
const editing = ref<Connection | null>(null)
const selectedIntegrationId = ref<string>('')
const name = ref('')
const config = ref<Record<string, unknown>>({})
const saving = ref(false)

// connection test state
const testing = ref(false)
const testResult = ref<{ ok: boolean, message: string } | null>(null)

const selectedIntegration = computed<IntegrationMeta | undefined>(() =>
  catalog.value.find(i => i.id === selectedIntegrationId.value)
)

interface AiModelItem {
  id: string
  label: string
}

const AI_PROVIDER_REQUIREMENTS: Record<string, { needsBaseUrl: boolean, needsKey: boolean }> = {
  'openai': { needsBaseUrl: false, needsKey: true },
  'anthropic': { needsBaseUrl: false, needsKey: true },
  'litellm': { needsBaseUrl: true, needsKey: true },
  'openai-compatible': { needsBaseUrl: true, needsKey: false },
  'anthropic-compatible': { needsBaseUrl: true, needsKey: false },
  'lmstudio': { needsBaseUrl: false, needsKey: false }
}

const aiModels = ref<AiModelItem[]>([])
const aiModelsLoading = ref(false)
const aiModelsError = ref('')
let aiModelTimer: ReturnType<typeof setTimeout> | null = null
let aiModelRequestId = 0

function aiProviderId() {
  return String(config.value.provider ?? 'openai')
}

const canFetchAiModels = computed(() => {
  if (!open.value || selectedIntegrationId.value !== 'ai') return false
  const req = AI_PROVIDER_REQUIREMENTS[aiProviderId()] ?? AI_PROVIDER_REQUIREMENTS.openai!
  if (req.needsBaseUrl && !String(config.value.baseUrl ?? '').trim()) return false
  if (req.needsKey && !String(config.value.apiKey ?? '').trim() && !editing.value?.id) return false
  return true
})

const aiModelOptions = computed(() => {
  const current = String(config.value.defaultModel ?? '').trim()
  const items = aiModels.value.map(model => ({ label: model.label, value: model.id }))
  if (current && !items.some(item => item.value === current)) {
    items.unshift({ label: current, value: current })
  }
  return items
})

const connectionSchema = computed(() => {
  const schema = selectedIntegration.value?.connectionSchema ?? []
  if (selectedIntegrationId.value !== 'ai' || aiModels.value.length === 0) return schema

  return schema.map(field => field.key === 'defaultModel'
    ? {
        ...field,
        type: 'select' as const,
        options: aiModelOptions.value,
        placeholder: aiModelsLoading.value ? 'Loading models...' : 'Choose a model'
      }
    : field)
})

function resetAiModels() {
  aiModels.value = []
  aiModelsError.value = ''
  aiModelsLoading.value = false
}

async function fetchAiModels() {
  if (!canFetchAiModels.value) {
    resetAiModels()
    return
  }

  const requestId = ++aiModelRequestId
  aiModelsLoading.value = true
  aiModelsError.value = ''
  aiModels.value = []

  try {
    const result = await $fetch<{ models: AiModelItem[] }>('/api/ai/models', {
      method: 'POST',
      body: {
        config: { ...config.value },
        connectionId: editing.value?.id
      }
    })
    if (requestId !== aiModelRequestId) return
    aiModels.value = result.models
  } catch (e: unknown) {
    if (requestId !== aiModelRequestId) return
    aiModelsError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not load models'
  } finally {
    if (requestId === aiModelRequestId) aiModelsLoading.value = false
  }
}

function queueAiModelFetch() {
  if (aiModelTimer) clearTimeout(aiModelTimer)
  if (!canFetchAiModels.value) {
    resetAiModels()
    return
  }
  aiModelTimer = setTimeout(() => {
    void fetchAiModels()
  }, 350)
}

const aiModelFetchKey = computed(() => JSON.stringify({
  open: open.value,
  integrationId: selectedIntegrationId.value,
  connectionId: editing.value?.id,
  provider: config.value.provider ?? 'openai',
  baseUrl: config.value.baseUrl ?? '',
  apiKey: config.value.apiKey ?? '',
  authStyle: config.value.authStyle ?? '',
  authHeaderName: config.value.authHeaderName ?? '',
  headers: config.value.headers ?? {}
}))

watch(aiModelFetchKey, queueAiModelFetch)

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await $fetch('/api/connections/test', {
      method: 'POST',
      body: {
        integrationId: selectedIntegrationId.value,
        config: config.value,
        connectionId: editing.value?.id
      }
    })
  } catch (e: unknown) {
    testResult.value = { ok: false, message: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Test failed' }
  } finally {
    testing.value = false
  }
}

// clear stale test result when the form changes
function clearTestResult() {
  testResult.value = null
}
watch([selectedIntegrationId, config], clearTestResult, { deep: true })

const integrationItems = computed(() => {
  const items = catalog.value.map(i => ({ label: i.name, value: i.id, icon: i.icon, img: i.img }))
  // a trailing entry to import a brand-new connector from an OpenAPI spec; only
  // offered when adding (the service can't be changed while editing).
  if (!editing.value) {
    items.push({ label: 'Import from OpenAPI…', value: IMPORT_OPTION, icon: 'i-lucide-download', img: undefined })
  }
  return items
})

// When the sentinel is picked, open the import modal rather than selecting it
// as a service. Revert the select to the previously-chosen integration so the
// dropdown never sits on the sentinel.
const prevIntegrationId = ref('')
watch(selectedIntegrationId, (id, old) => {
  if (id === IMPORT_OPTION) {
    selectedIntegrationId.value = old && old !== IMPORT_OPTION ? old : (catalog.value[0]?.id ?? '')
    importOpen.value = true
  } else {
    prevIntegrationId.value = id
  }
})

// After a connector is installed, refresh the catalog + connectors list. If the
// import was launched from the Service dropdown (the add-connection modal is
// open), select the new integration so the user continues seamlessly.
async function onConnectorInstalled(integrationId: string) {
  await Promise.all([refreshNuxtData('integrations'), refreshConnectors()])
  if (open.value) {
    selectedIntegrationId.value = integrationId
    config.value = {}
    testResult.value = null
  }
}

function metaFor(integrationId: string) {
  return catalog.value.find(i => i.id === integrationId)
}

function openAdd() {
  editing.value = null
  selectedIntegrationId.value = catalog.value[0]?.id ?? ''
  name.value = ''
  config.value = {}
  resetAiModels()
  testResult.value = null
  open.value = true
}

function openEdit(c: Connection) {
  editing.value = c
  selectedIntegrationId.value = c.integrationId
  name.value = c.name
  config.value = { ...c.config }
  resetAiModels()
  testResult.value = null
  open.value = true
}

async function save() {
  if (!name.value.trim()) {
    toast.add({ title: 'Give the connection a name', color: 'warning' })
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await $fetch(`/api/connections/${editing.value.id}`, {
        method: 'PUT',
        body: { name: name.value, config: config.value }
      })
    } else {
      await $fetch('/api/connections', {
        method: 'POST',
        body: { integrationId: selectedIntegrationId.value, name: name.value, config: config.value }
      })
    }
    open.value = false
    await refresh()
    toast.add({ title: 'Connection saved', color: 'success' })
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
    toast.add({ title: msg, color: 'error' })
  } finally {
    saving.value = false
  }
}

// Mark one AI connection as the default for the flow assistant (stored as
// config.defaultForAssist). Setting it on one clears it on the others. Redacted
// secrets are merged back server-side, so sending the redacted config is safe.
const settingDefault = ref<string | null>(null)
async function setAssistDefault(target: Connection) {
  settingDefault.value = target.id
  try {
    const ai = connections.value.filter(c => c.integrationId === 'ai')
    await Promise.all(ai.map(c =>
      $fetch(`/api/connections/${c.id}`, {
        method: 'PUT',
        body: { name: c.name, config: { ...c.config, defaultForAssist: c.id === target.id } }
      })
    ))
    await refresh()
  } catch (e: unknown) {
    toast.add({ title: (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not update default', color: 'error' })
  } finally {
    settingDefault.value = null
  }
}

const deleteTarget = ref<Connection | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  await $fetch(`/api/connections/${deleteTarget.value.id}`, { method: 'DELETE' })
  deleteTarget.value = null
  await refresh()
  toast.add({ title: 'Connection removed', color: 'success' })
}

const connectorDeleteTarget = ref<ConnectorRow | null>(null)
async function confirmConnectorDelete() {
  if (!connectorDeleteTarget.value) return
  await $fetch(`/api/connectors/${connectorDeleteTarget.value.id}`, { method: 'DELETE' })
  connectorDeleteTarget.value = null
  await Promise.all([refreshConnectors(), refreshNuxtData('integrations')])
  toast.add({ title: 'Connector removed', color: 'success' })
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          Connections
        </h1>
        <p class="mt-1 text-sm text-muted">
          Your saved credentials for each service. Flows use these to talk to Dokploy, Bunny, Uptime Kuma and more.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Add connection"
        class="self-start"
        @click="openAdd"
      />
    </div>

    <div
      v-if="connections.length === 0"
      class="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-default py-20 text-center"
    >
      <span class="flex size-12 items-center justify-center rounded-2xl bg-elevated text-dimmed">
        <UIcon
          name="i-lucide-plug"
          class="size-6"
        />
      </span>
      <div class="space-y-1">
        <p class="font-medium text-highlighted">
          No connections yet
        </p>
        <p class="text-sm text-muted">
          Add your first one to start building flows.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Add connection"
        @click="openAdd"
      />
    </div>

    <div
      v-else
      class="grid gap-3 sm:grid-cols-2"
    >
      <UCard
        v-for="c in connections"
        :key="c.id"
        variant="sm"
        :ui="{ body: 'flex items-center gap-3' }"
      >
        <div class="flex items-center gap-2 group w-full">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated">
            <UIcon
              v-if="metaFor(c.integrationId)?.icon"
              :name="metaFor(c.integrationId)?.icon || 'i-lucide-plug'"
              class="size-5 text-muted"
            />
            <img
              v-else-if="metaFor(c.integrationId)?.img"
              :src="metaFor(c.integrationId)?.img"
              alt="Service icon"
              class="size-5"
            >
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-highlighted">
              {{ c.name }}
            </p>
            <p class="text-sm text-muted">
              {{ metaFor(c.integrationId)?.name || c.integrationId }}
            </p>
          </div>

          <UTooltip
            v-if="c.integrationId === 'ai'"
            text="Use for AI assist by default"
          >
            <USwitch
              :model-value="c.config?.defaultForAssist === true"
              size="sm"
              :loading="settingDefault === c.id"
              :disabled="settingDefault !== null"
              aria-label="Use for AI assist by default"
              @update:model-value="setAssistDefault(c)"
            />
          </UTooltip>

          <div class="reveal-on-hover flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Edit"
              @click="openEdit(c)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              aria-label="Delete"
              @click="deleteTarget = c"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- custom connectors: service types imported from an OpenAPI spec. Distinct
         from connections above (those are saved credentials); a connector adds a
         new service you can then create connections for. -->
    <div
      v-if="userConnectors.length"
      class="mt-12"
    >
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 class="text-base font-semibold tracking-tight text-highlighted">
            Custom connectors
          </h2>
          <p class="mt-0.5 text-sm text-muted">
            Services you imported from an OpenAPI / Swagger spec. They appear in the “Add connection” list above. Add more via “Import from OpenAPI…” there.
          </p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <UCard
          v-for="c in userConnectors"
          :key="c.id"
          variant="sm"
          :ui="{ body: 'flex items-center gap-3' }"
        >
          <div class="flex items-center gap-2 group w-full">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated">
              <UIcon
                name="i-lucide-blocks"
                class="size-5 text-muted"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ c.name }}
              </p>
              <p class="text-sm text-muted">
                {{ c.actionCount }} action{{ c.actionCount === 1 ? '' : 's' }}<span v-if="c.version"> · v{{ c.version }}</span>
              </p>
            </div>
            <div class="reveal-on-hover flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                aria-label="Delete connector"
                @click="connectorDeleteTarget = c"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- add/edit modal -->
    <UModal
      v-model:open="open"
      :title="editing ? 'Edit connection' : 'Add connection'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Service"
            required
          >
            <USelect
              v-model="selectedIntegrationId"
              :items="integrationItems"
              :disabled="!!editing"
              class="w-full"
            >
              <template #leading="{ modelValue }">
                <div class="flex flex-row items-center gap-2 w-fit">
                  <img
                    v-if="metaFor(modelValue)?.img"
                    :src="metaFor(modelValue)?.img"
                    alt="Service icon"
                    class="size-4.5"
                  >
                  <UIcon
                    v-else-if="metaFor(modelValue)?.icon"
                    :name="metaFor(modelValue)?.icon || 'i-lucide-plug'"
                    class="size-4"
                  />
                </div>
              </template>

              <template #item-label="{ item }">
                <div class="flex flex-row items-center gap-2">
                  <img
                    v-if="item?.img"
                    :src="item.img"
                    alt="Service icon"
                    class="size-4.5"
                  >
                  <UIcon
                    v-else-if="item?.icon"
                    :name="item.icon"
                    class="size-4"
                  />
                  {{ item.label }}
                </div>
              </template>
            </USelect>
          </UFormField>

          <UFormField
            label="Name"
            required
            description="A label to recognise this connection, e.g. “Production Dokploy”."
          >
            <UInput
              v-model="name"
              placeholder="My connection"
              class="w-full"
            />
          </UFormField>

          <USeparator v-if="connectionSchema.length" />

          <SchemaForm
            v-if="selectedIntegration"
            v-model="config"
            :schema="connectionSchema"
          />

          <UAlert
            v-if="selectedIntegrationId === 'ai' && aiModelsError"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="Could not load models"
            :description="aiModelsError"
          />

          <UAlert
            v-if="testResult"
            :color="testResult.ok ? 'success' : 'error'"
            variant="soft"
            :icon="testResult.ok ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
            :title="testResult.ok ? 'Connection works' : 'Connection failed'"
            :description="testResult.message"
          />
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            v-if="selectedIntegration?.canTest"
            label="Test"
            icon="i-lucide-plug-zap"
            color="neutral"
            variant="soft"
            :loading="testing"
            @click="testConnection"
          />
          <span v-else />
          <div class="flex gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="close"
            />
            <UButton
              :label="editing ? 'Save' : 'Add'"
              :loading="saving"
              @click="save"
            />
          </div>
        </div>
      </template>
    </UModal>

    <ConnectorImportModal
      v-model:open="importOpen"
      @installed="onConnectorInstalled"
    />

    <!-- delete confirm -->
    <UModal
      :open="!!deleteTarget"
      title="Remove connection?"
      :description="`Flows using “${deleteTarget?.name}” will stop working. This also removes any machines under it.`"
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

    <!-- connector delete confirm -->
    <UModal
      :open="!!connectorDeleteTarget"
      title="Remove connector?"
      :description="`Flows and connections using “${connectorDeleteTarget?.name}” will stop working.`"
      :ui="{ footer: 'justify-end' }"
      @update:open="(v) => { if (!v) connectorDeleteTarget = null }"
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="connectorDeleteTarget = null"
        />
        <UButton
          label="Remove"
          color="error"
          @click="confirmConnectorDelete"
        />
      </template>
    </UModal>
  </UContainer>
</template>
