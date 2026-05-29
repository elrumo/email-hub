<script setup lang="ts">
/**
 * Shared "Import from OpenAPI / Swagger" modal. Two-step: POST
 * /api/connectors/import parses a spec (file contents or URL) into a
 * ConnectorDef and returns it for review; the user then installs it via POST
 * /api/connectors (the normal validate→register path).
 *
 * Used both by the Connectors page and the connection editor's Service
 * dropdown. Emits `installed` with the new integration id (e.g. "x-petstore")
 * so the caller can refresh its catalog and select it.
 */

interface ImportSummary {
  id: string
  name: string
  version?: string
  connectionFields: number
  actions: Array<{ id: string, name: string, method: string }>
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ installed: [integrationId: string] }>()

const toast = useToast()

const mode = ref<'file' | 'url'>('url')
const specUrl = ref('')
const specText = ref('')
const fileName = ref('')
const includeText = ref('')
const baseUrl = ref('')
const importing = ref(false)

// review state (populated after a successful parse)
const reviewDef = ref<Record<string, unknown> | null>(null)
const summary = ref<ImportSummary | null>(null)
const warnings = ref<string[]>([])
const installing = ref(false)

function reset() {
  mode.value = 'url'
  specUrl.value = ''
  specText.value = ''
  fileName.value = ''
  includeText.value = ''
  baseUrl.value = ''
  reviewDef.value = null
  summary.value = null
  warnings.value = []
}

// reset whenever the modal (re)opens so it never shows stale review state
watch(open, (v) => {
  if (v) reset()
})

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  specText.value = await file.text()
}

async function runImport() {
  importing.value = true
  reviewDef.value = null
  summary.value = null
  warnings.value = []
  try {
    const include = includeText.value
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
    const res = await $fetch<{ ok: boolean, def?: Record<string, unknown>, summary?: ImportSummary, warnings?: string[], error?: string }>(
      '/api/connectors/import',
      {
        method: 'POST',
        body: {
          url: mode.value === 'url' ? specUrl.value.trim() : undefined,
          spec: mode.value === 'file' ? specText.value : undefined,
          include: include.length ? include : undefined,
          baseUrl: baseUrl.value.trim() || undefined
        }
      }
    )
    if (!res.ok || !res.def) {
      toast.add({ title: res.error || 'Import failed', color: 'error' })
      warnings.value = res.warnings ?? []
      return
    }
    reviewDef.value = res.def
    summary.value = res.summary ?? null
    warnings.value = res.warnings ?? []
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Import failed'
    toast.add({ title: msg, color: 'error' })
  } finally {
    importing.value = false
  }
}

async function install() {
  if (!reviewDef.value) return
  installing.value = true
  try {
    const res = await $fetch<{ integrationId: string }>('/api/connectors', {
      method: 'POST',
      body: { def: reviewDef.value, source: mode.value === 'url' ? specUrl.value.trim() : `file:${fileName.value}` }
    })
    open.value = false
    toast.add({ title: `Connector “${summary.value?.name}” installed`, color: 'success' })
    emit('installed', res.integrationId)
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Install failed'
    toast.add({ title: msg, color: 'error' })
  } finally {
    installing.value = false
  }
}

const canImport = computed(() =>
  mode.value === 'url' ? !!specUrl.value.trim() : !!specText.value.trim()
)

const methodColor: Record<string, string> = {
  GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'error'
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import from OpenAPI / Swagger"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <UTabs
          v-model="mode"
          :items="[
            { label: 'From URL', value: 'url', icon: 'i-lucide-link' },
            { label: 'From file', value: 'file', icon: 'i-lucide-file-up' }
          ]"
          :content="false"
        />

        <UFormField
          v-if="mode === 'url'"
          label="Spec URL"
          description="Link to an OpenAPI 3.x or Swagger 2.0 JSON/YAML document."
        >
          <UInput
            v-model="specUrl"
            placeholder="https://api.example.com/openapi.json"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-else
          label="Spec file"
          description="A .json, .yaml or .yml OpenAPI / Swagger document."
        >
          <input
            type="file"
            accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
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

        <UCollapsible>
          <UButton
            label="Advanced"
            color="neutral"
            variant="link"
            trailing-icon="i-lucide-chevron-down"
            class="px-0"
          />
          <template #content>
            <div class="space-y-4 pt-2">
              <UFormField
                label="Limit to tags / paths"
                description="Comma- or newline-separated OpenAPI tags or path prefixes. Leave empty to import every operation."
              >
                <UTextarea
                  v-model="includeText"
                  :rows="2"
                  placeholder="projects, /v2/deployments"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Base URL override"
                description="Use when the spec has no absolute server URL (e.g. a relative servers[].url)."
              >
                <UInput
                  v-model="baseUrl"
                  placeholder="https://api.example.com"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>
        </UCollapsible>

        <UButton
          label="Parse spec"
          icon="i-lucide-wand-2"
          :loading="importing"
          :disabled="!canImport"
          block
          @click="runImport"
        />

        <UAlert
          v-for="(w, i) in warnings"
          :key="i"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="w"
        />

        <!-- review -->
        <div
          v-if="summary"
          class="space-y-3 rounded-xl border border-default p-4"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="font-medium text-highlighted">
                {{ summary.name }}
              </p>
              <p class="text-sm text-muted">
                id: {{ summary.id }}<span v-if="summary.version"> · v{{ summary.version }}</span> ·
                {{ summary.connectionFields }} credential field{{ summary.connectionFields === 1 ? '' : 's' }}
              </p>
            </div>
            <UBadge
              :label="`${summary.actions.length} actions`"
              color="neutral"
              variant="subtle"
            />
          </div>
          <div class="max-h-56 space-y-1 overflow-y-auto">
            <div
              v-for="a in summary.actions"
              :key="a.id"
              class="flex items-center gap-2 text-sm"
            >
              <UBadge
                :label="a.method"
                :color="(methodColor[a.method] as any) || 'neutral'"
                variant="subtle"
                size="sm"
                class="w-16 justify-center"
              />
              <span class="truncate text-highlighted">{{ a.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="close"
        />
        <UButton
          label="Install connector"
          icon="i-lucide-check"
          :disabled="!reviewDef"
          :loading="installing"
          @click="install"
        />
      </div>
    </template>
  </UModal>
</template>
