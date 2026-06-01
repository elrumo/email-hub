<script setup lang="ts">
import type { Connection, Flow } from '~/types'
import type { FlowChatApplyPayload } from '~/composables/useFlowChat'
import { scheduleSummary } from '~/composables/format'

const { data: flows, refresh } = await useFetch<Flow[]>('/api/flows', {
  key: 'flows',
  default: () => []
})
// the AI launcher needs the integration catalog + saved connections
const { data: catalog } = useCatalog()
const { data: connections } = await useFetch<Connection[]>('/api/connections', {
  key: 'connections',
  default: () => []
})
const toast = useToast()
const running = ref<string | null>(null)
const router = useRouter()

// ── search (Siri "All Shortcuts" filter) ─────────────────────────────────────
const search = ref('')
const filteredFlows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return flows.value
  return flows.value.filter(f =>
    f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q)
  )
})

// ── AI launcher (Claude-style composer → floating chat) ──────────────────────
const pendingDraft = usePendingFlowDraft()
const chatPrompt = ref('')
const chatOpen = ref(false)
const seededPrompt = ref('')
const promptSuggestions = [
  'Alert me when an Uptime Kuma monitor goes down',
  'Every morning, check a server and warn me if disk is over 90%',
  'When a webhook fires, post a message and run a follow-up'
]

function launchChat(prompt?: string) {
  if (prompt !== undefined) chatPrompt.value = prompt
  seededPrompt.value = chatPrompt.value.trim()
  chatPrompt.value = ''
  chatOpen.value = true
}
// reopening the dock via its own button should start fresh, not replay the
// last seeded prompt
watch(chatOpen, (v) => {
  if (!v) seededPrompt.value = ''
})

function onChatApply(p: FlowChatApplyPayload) {
  // hand the AI draft to the builder for review, then save
  pendingDraft.value = {
    name: p.name,
    description: p.description,
    definition: { trigger: p.trigger, steps: p.steps, notifyOnRun: 'never' }
  }
  router.push('/flows/new')
}

function startExample(id: string) {
  router.push({ path: '/flows/new', query: { example: id } })
}

function triggerSummary(f: Flow): string {
  const t = f.definition?.trigger
  if (!t) return 'No trigger'
  if (t.integrationId === 'core' && t.triggerId === 'cron') return scheduleSummary(f)
  if (t.triggerId === 'manual') return 'Manual'
  if (t.triggerId === 'webhook') return 'Webhook'
  return `${t.integrationId} · ${t.triggerId}`
}

async function runNow(f: Flow) {
  running.value = f.id
  try {
    const res = await $fetch<{ status: string }>(`/api/flows/${f.id}/run`, { method: 'POST', body: {} })
    toast.add({
      title: `Ran “${f.name}”`,
      description: `Result: ${res.status}`,
      color: res.status === 'error' ? 'error' : 'success'
    })
    await refresh()
  } catch {
    toast.add({ title: 'Run failed', color: 'error' })
  } finally {
    running.value = null
  }
}

async function toggle(f: Flow) {
  await $fetch(`/api/flows/${f.id}`, { method: 'PUT', body: { enabled: !f.enabled } })
  await refresh()
}

const deleteTarget = ref<Flow | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  await $fetch(`/api/flows/${deleteTarget.value.id}`, { method: 'DELETE' })
  deleteTarget.value = null
  await refresh()
  toast.add({ title: 'Flow deleted', color: 'success' })
}

// ── share / export ───────────────────────────────────────────────────────────
async function exportFlow(f: Flow) {
  try {
    const bundle = await $fetch(`/api/flows/${f.id}/export`)
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flow'}.flow.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.add({ title: `Exported “${f.name}”`, description: 'Share the downloaded .flow.json', color: 'success' })
  } catch {
    toast.add({ title: 'Export failed', color: 'error' })
  }
}

// ── import ───────────────────────────────────────────────────────────────────
const importOpen = ref(false)
async function onImported(flowId: string) {
  await refresh()
  router.push(`/flows/${flowId}`)
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <!-- Header: just the title and the single primary action. The example
         flows now live inside the "Create new flow" popover, so the home
         screen stays focused on the user's own flows. -->
    <div class="mb-8 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
        Flows
      </h1>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-download"
          color="neutral"
          variant="ghost"
          aria-label="Import flow"
          class="rounded-full"
          @click="importOpen = true"
        />
        <FlowCreateMenu
          @scratch="router.push('/flows/new')"
          @example="startExample"
        />
      </div>
    </div>

    <!-- Minimalistic ChatGPT-style composer. One clean line, a circular send
         button, and a few quiet suggestion chips underneath — nothing else. -->
    <div class="mx-auto mb-10 max-w-2xl">
      <UChatPrompt
        v-model="chatPrompt"
        variant="subtle"
        :rows="1"
        autoresize
        placeholder="Ask AI to build a flow…"
        :ui="{ root: 'rounded-3xl shadow-sm', base: 'rounded-3xl' }"
        @submit="launchChat()"
      >
        <UChatPromptSubmit
          color="neutral"
          icon="i-lucide-arrow-up"
          class="rounded-full"
        />
      </UChatPrompt>

      <div class="mt-3 flex flex-wrap justify-center gap-2">
        <button
          v-for="s in promptSuggestions"
          :key="s"
          type="button"
          class="rounded-full px-3 py-1 text-xs text-muted transition-colors hover:bg-elevated hover:text-highlighted"
          @click="launchChat(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <!-- Siri-style rounded search bar -->
    <UInput
      v-if="flows.length > 0"
      v-model="search"
      icon="i-lucide-search"
      size="xl"
      placeholder="Search your flows"
      class="mb-6 w-full"
      :ui="{ base: 'rounded-full bg-elevated/60' }"
    />

    <!-- empty: no flows at all -->
    <div
      v-if="flows.length === 0"
      class="flex flex-col items-center gap-5 rounded-3xl border border-dashed border-default px-6 py-16 text-center"
    >
      <span class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-elevated text-dimmed">
        <UIcon
          name="i-lucide-workflow"
          class="size-7"
        />
      </span>
      <div class="space-y-1">
        <p class="font-medium text-highlighted">
          No flows yet
        </p>
        <p class="text-sm text-muted">
          Describe one to the assistant above, or create a new flow from scratch or a template.
        </p>
      </div>
      <FlowCreateMenu
        @scratch="router.push('/flows/new')"
        @example="startExample"
      />
    </div>

    <!-- empty: search matched nothing -->
    <div
      v-else-if="filteredFlows.length === 0"
      class="rounded-3xl border border-dashed border-default px-6 py-16 text-center text-sm text-muted"
    >
      No flows match “{{ search }}”.
    </div>

    <!-- the colourful tile wall -->
    <div
      v-else
      class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5"
    >
      <FlowCard
        v-for="f in filteredFlows"
        :key="f.id"
        :flow="f"
        size="grid"
        :running="running === f.id"
        :trigger-summary="triggerSummary(f)"
        @run="runNow(f)"
        @toggle="toggle(f)"
        @delete="deleteTarget = f"
        @export="exportFlow(f)"
      />
    </div>

    <!-- floating AI chat, opened by the composer above -->
    <FlowChatDock
      v-model:open="chatOpen"
      :catalog="catalog"
      :connections="connections"
      :initial-prompt="seededPrompt"
      button-label="Build with AI"
      @apply="onChatApply"
    />

    <UModal
      :open="!!deleteTarget"
      title="Delete flow?"
      :description="`“${deleteTarget?.name}” and its run history will be permanently removed.`"
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
          label="Delete"
          color="error"
          @click="confirmDelete"
        />
      </template>
    </UModal>

    <FlowImportModal
      v-model:open="importOpen"
      @imported="onImported"
    />
  </UContainer>
</template>
