<script setup lang="ts">
/**
 * Import a shared flow bundle. Two steps:
 *  1. Provide a bundle (paste JSON / upload .flow.json / URL) → POST
 *     /api/flows/import/inspect, which reports required connectors (installed vs
 *     missing) and the connection slots to bind, each with the user's matching
 *     connections.
 *  2. Bind every slot to one of your connections → POST /api/flows/import,
 *     which creates the flow (disabled, pending review).
 *
 * Emits `imported` with the new flow id so the caller can refresh + navigate.
 */

interface SlotOption { id: string, name: string }
interface InspectSlot {
  placeholder: string
  integrationId: string
  label: string
  connectorInstalled: boolean
  options: SlotOption[]
}
interface InspectResult {
  name: string
  description?: string
  meta?: { author?: string, version?: string }
  connectors: Array<{ integrationId: string, installed: boolean }>
  slots: InspectSlot[]
  ready: boolean
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [flowId: string] }>()
const toast = useToast()

const mode = ref<'file' | 'json' | 'url'>('file')
const bundleText = ref('')
const bundleUrl = ref('')
const fileName = ref('')
const inspecting = ref(false)
const importing = ref(false)

// step 2 state
const inspected = ref<InspectResult | null>(null)
const parsedBundle = ref<unknown>(null) // the bundle object we inspected (for the import call)
const bindings = ref<Record<string, string>>({})
const flowName = ref('')

function reset() {
  mode.value = 'file'
  bundleText.value = ''
  bundleUrl.value = ''
  fileName.value = ''
  inspected.value = null
  parsedBundle.value = null
  bindings.value = {}
  flowName.value = ''
}
watch(open, (v) => {
  if (v) reset()
})

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  bundleText.value = await file.text()
}

async function inspect() {
  inspecting.value = true
  inspected.value = null
  try {
    let body: Record<string, unknown>
    if (mode.value === 'url') {
      body = { url: bundleUrl.value.trim() }
    } else {
      const parsed = JSON.parse(bundleText.value)
      parsedBundle.value = parsed
      body = { bundle: parsed }
    }
    const res = await $fetch<InspectResult>('/api/flows/import/inspect', { method: 'POST', body })
    // a url-fetched bundle isn't in hand for the import call; re-fetch shape by
    // asking the server to inspect returns metadata only, so for url mode we
    // pass the url through to import too.
    inspected.value = res
    flowName.value = res.name
    // pre-select the only option per slot when there's exactly one
    for (const slot of res.slots) {
      if (slot.options.length === 1) bindings.value[slot.placeholder] = slot.options[0]!.id
    }
  } catch (e) {
    const msg = e instanceof SyntaxError ? 'That is not valid JSON' : errMsg(e, 'Could not read the bundle')
    toast.add({ title: msg, color: 'error' })
  } finally {
    inspecting.value = false
  }
}

const allBound = computed(() =>
  !!inspected.value && inspected.value.slots.every(s => !!bindings.value[s.placeholder])
)

async function doImport() {
  if (!inspected.value) return
  importing.value = true
  try {
    const body: Record<string, unknown> = {
      bindings: bindings.value,
      name: flowName.value.trim() || inspected.value.name
    }
    if (mode.value === 'url') body.url = bundleUrl.value.trim()
    else body.bundle = parsedBundle.value
    const res = await $fetch<{ id: string }>('/api/flows/import', { method: 'POST', body })
    open.value = false
    toast.add({ title: `Imported “${flowName.value}” (disabled — review then enable)`, color: 'success' })
    emit('imported', res.id)
  } catch (e) {
    toast.add({ title: errMsg(e, 'Import failed'), color: 'error' })
  } finally {
    importing.value = false
  }
}

const canInspect = computed(() =>
  mode.value === 'url' ? !!bundleUrl.value.trim() : !!bundleText.value.trim()
)
function errMsg(e: unknown, fallback: string): string {
  return (e as { data?: { statusMessage?: string } })?.data?.statusMessage || fallback
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import a flow"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- step 1: provide bundle -->
        <template v-if="!inspected">
          <UTabs
            v-model="mode"
            :items="[
              { label: 'Upload', value: 'file', icon: 'i-lucide-file-up' },
              { label: 'Paste JSON', value: 'json', icon: 'i-lucide-code' },
              { label: 'From URL', value: 'url', icon: 'i-lucide-link' }
            ]"
            :content="false"
          />
          <UFormField
            v-if="mode === 'file'"
            label="Flow bundle file"
            description="A .flow.json exported from another flow."
          >
            <input
              type="file"
              accept=".json,application/json"
              class="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-highlighted"
              @change="onFile"
            >
            <p
              v-if="fileName"
              class="mt-1 text-xs text-muted"
            >
              Loaded: {{ fileName }}
            </p>
          </UFormField>
          <UTextarea
            v-else-if="mode === 'json'"
            v-model="bundleText"
            :rows="8"
            placeholder="{ &quot;bundleVersion&quot;: 1, &quot;name&quot;: &quot;...&quot;, &quot;connectors&quot;: [...], &quot;requires&quot;: [...], &quot;definition&quot;: {...} }"
            class="w-full font-mono text-xs"
          />
          <UInput
            v-else
            v-model="bundleUrl"
            placeholder="https://example.com/my-flow.flow.json"
            class="w-full"
          />
          <UButton
            label="Continue"
            icon="i-lucide-arrow-right"
            trailing
            block
            :loading="inspecting"
            :disabled="!canInspect"
            @click="inspect"
          />
        </template>

        <!-- step 2: review + bind -->
        <template v-else>
          <UFormField label="Flow name">
            <UInput
              v-model="flowName"
              class="w-full"
            />
          </UFormField>

          <!-- required connectors -->
          <div class="space-y-2">
            <p class="text-sm font-medium text-highlighted">
              Required connectors
            </p>
            <div
              v-for="c in inspected.connectors"
              :key="c.integrationId"
              class="flex items-center gap-2 text-sm"
            >
              <UIcon
                :name="c.installed ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
                :class="c.installed ? 'text-success' : 'text-error'"
              />
              <span class="text-highlighted">{{ c.integrationId }}</span>
              <span
                v-if="!c.installed"
                class="text-muted"
              >— not installed</span>
            </div>
            <UAlert
              v-if="!inspected.ready"
              color="error"
              variant="soft"
              icon="i-lucide-triangle-alert"
              title="Install the missing connectors first"
              description="Open Connections → Browse, install the connector(s) above, then import again."
            />
          </div>

          <!-- connection slot bindings -->
          <div
            v-if="inspected.slots.length"
            class="space-y-3"
          >
            <p class="text-sm font-medium text-highlighted">
              Connect to your accounts
            </p>
            <UFormField
              v-for="slot in inspected.slots"
              :key="slot.placeholder"
              :label="slot.label"
            >
              <USelectMenu
                v-if="slot.options.length"
                v-model="bindings[slot.placeholder]"
                :items="slot.options.map(o => ({ label: o.name, value: o.id }))"
                value-key="value"
                placeholder="Pick a connection"
                class="w-full"
              />
              <UAlert
                v-else
                color="warning"
                variant="soft"
                icon="i-lucide-info"
                :description="`No ${slot.integrationId} connection yet — create one on the Connections page, then import.`"
              />
            </UFormField>
          </div>
        </template>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-between gap-2">
        <UButton
          v-if="inspected"
          label="Back"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          @click="inspected = null"
        />
        <div class="ml-auto flex gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="close"
          />
          <UButton
            v-if="inspected"
            label="Import flow"
            icon="i-lucide-check"
            :loading="importing"
            :disabled="!inspected.ready || !allBound"
            @click="doImport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
