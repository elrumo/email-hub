<script setup lang="ts">
import type { Connection, Flow } from '~/types'
import type { FlowChatApplyPayload } from '~/composables/useFlowChat'
import { relTime, scheduleSummary } from '~/composables/format'

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
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          Flows
        </h1>
        <p class="mt-1 text-sm text-muted">
          Automations that run on a schedule, a webhook, or a button. Each is a trigger followed by a list of actions.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="New flow"
        to="/flows/new"
        class="self-start"
      />
    </div>

    <!-- Claude-style AI launcher on top of the list -->
    <div class="mb-8 rounded-2xl border border-default bg-default p-4 sm:p-5">
      <div class="mb-3 flex items-start gap-2.5">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UIcon
            name="i-lucide-sparkles"
            class="size-4"
          />
        </span>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            Build a flow with AI
          </p>
          <p class="text-sm text-muted">
            Describe what you want to automate — I’ll pick monitors and conditions with you, then draft it.
          </p>
        </div>
      </div>

      <UChatPrompt
        v-model="chatPrompt"
        placeholder="e.g. Alert me when my API monitor goes down for 5 minutes…"
        @submit="launchChat()"
      >
        <UChatPromptSubmit
          label="Start"
          icon="i-lucide-arrow-up"
        />
      </UChatPrompt>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="s in promptSuggestions"
          :key="s"
          type="button"
          class="rounded-full border border-default px-3 py-1 text-xs text-muted transition-colors hover:bg-elevated hover:text-highlighted"
          @click="launchChat(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div
      v-if="flows.length === 0"
      class="flex flex-col gap-5 rounded-2xl border border-dashed border-default p-6 text-center sm:flex-row sm:items-start sm:text-left sm:p-8"
    >
      <span class="flex size-12 shrink-0 items-center justify-center self-center rounded-2xl bg-elevated text-dimmed sm:self-start">
        <UIcon
          name="i-lucide-workflow"
          class="size-6"
        />
      </span>
      <div class="space-y-1">
        <p class="font-medium text-highlighted">
          No flows yet
        </p>
        <p class="text-sm text-muted">
          Start from scratch, describe one to the assistant above, or grab a template below and make it yours.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="New blank flow"
        to="/flows/new"
        class="self-center sm:ml-auto sm:self-start"
      />
    </div>

    <div
      v-else
      class="space-y-3"
    >
      <UCard
        v-for="f in flows"
        :key="f.id"
        :ui="{ body: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4' }"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <NuxtLink
              :to="`/flows/${f.id}`"
              class="truncate font-medium text-highlighted hover:text-primary"
            >
              {{ f.name }}
            </NuxtLink>
            <UBadge
              :color="f.enabled ? 'success' : 'neutral'"
              variant="soft"
              size="sm"
            >
              {{ f.enabled ? 'Enabled' : 'Disabled' }}
            </UBadge>
          </div>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
            <UIcon
              name="i-lucide-zap"
              class="size-3.5"
            />
            {{ triggerSummary(f) }}
            <span class="text-dimmed">·</span>
            <span class="text-dimmed">last run {{ relTime(f.lastRunAt) }}</span>
          </p>
        </div>

        <div class="flex items-center gap-1 self-end sm:self-auto">
          <UButton
            icon="i-lucide-play"
            label="Run now"
            color="neutral"
            variant="soft"
            size="sm"
            :loading="running === f.id"
            @click="runNow(f)"
          />
          <USwitch
            :model-value="f.enabled"
            @update:model-value="toggle(f)"
          />
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Edit"
            :to="`/flows/${f.id}`"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            aria-label="Delete"
            @click="deleteTarget = f"
          />
        </div>
      </UCard>
    </div>

    <!-- ── Discover: community flows, then templates ──────────────────────────
         The community-flows feature is being built separately; it mounts into
         the #community-flows anchor below. Templates sit *behind* it as the
         always-available fallback so there's never an empty discover area. -->
    <section class="mt-12 space-y-8">
      <!-- community flows mount point (filled by the community feature) -->
      <div id="community-flows" />

      <div>
        <div class="mb-4 flex items-start gap-2.5">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-muted">
            <UIcon
              name="i-lucide-layout-template"
              class="size-4"
            />
          </span>
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              Templates
            </h2>
            <p class="text-sm text-muted">
              Proven starting points. Open one in the builder, swap in your connections, and save — everything stays editable.
            </p>
          </div>
        </div>

        <FlowExampleGallery
          @select="startExample"
        />
      </div>
    </section>

    <!-- floating AI chat, opened by the launcher above -->
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
  </UContainer>
</template>
