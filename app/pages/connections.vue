<script setup lang="ts">
import type { Connection, IntegrationMeta } from '~/types'

const { data: catalog } = useCatalog()
const { data: connections, refresh } = await useFetch<Connection[]>('/api/connections', {
  key: 'connections',
  default: () => []
})

const toast = useToast()

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
  return catalog.value.map(i => ({ label: i.name, value: i.id, icon: i.icon, img: i.img }))
})

function metaFor(integrationId: string) {
  return catalog.value.find(i => i.id === integrationId)
}

function openAdd() {
  editing.value = null
  selectedIntegrationId.value = catalog.value[0]?.id ?? ''
  name.value = ''
  config.value = {}
  testResult.value = null
  open.value = true
}

function openEdit(c: Connection) {
  editing.value = c
  selectedIntegrationId.value = c.integrationId
  name.value = c.name
  config.value = { ...c.config }
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

const deleteTarget = ref<Connection | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  await $fetch(`/api/connections/${deleteTarget.value.id}`, { method: 'DELETE' })
  deleteTarget.value = null
  await refresh()
  toast.add({ title: 'Connection removed', color: 'success' })
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
              <template #leading="{ modelValue, ui }">
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

          <USeparator v-if="selectedIntegration?.connectionSchema.length" />

          <SchemaForm
            v-if="selectedIntegration"
            v-model="config"
            :schema="selectedIntegration.connectionSchema"
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
  </UContainer>
</template>
