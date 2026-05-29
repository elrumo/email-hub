<script setup lang="ts">
import type { Connection, Flow, FlowRun } from '~/types'
import { relTime } from '~/composables/format'

const route = useRoute()
const id = route.params.id as string

const { data: catalog } = useCatalog()
const { data: connections } = await useFetch<Connection[]>('/api/connections', {
  key: 'connections',
  default: () => []
})
const { data: flows } = await useFetch<Flow[]>('/api/flows', { key: 'flows', default: () => [] })
const flow = computed(() => flows.value.find(f => f.id === id) ?? null)

const { data: runs, refresh: refreshRuns } = await useFetch<FlowRun[]>(`/api/flows/${id}/runs`, {
  key: `runs-${id}`,
  default: () => []
})

const toast = useToast()
const running = ref(false)
async function runNow() {
  running.value = true
  try {
    const res = await $fetch<{ status: string }>(`/api/flows/${id}/run`, { method: 'POST', body: {} })
    toast.add({ title: `Result: ${res.status}`, color: res.status === 'error' ? 'error' : 'success' })
    await refreshRuns()
  } finally {
    running.value = false
  }
}

function statusColor(s: string) {
  return s === 'success' ? 'success' : s === 'error' ? 'error' : s === 'running' ? 'info' : 'neutral'
}
const expandedRun = ref<string | null>(null)
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-8 flex items-start justify-between gap-4">
      <div>
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          label="Flows"
          color="neutral"
          variant="ghost"
          size="sm"
          class="-ml-2 mb-3"
        />
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          {{ flow?.name ?? 'Flow' }}
        </h1>
      </div>
      <UButton
        icon="i-lucide-play"
        label="Run now"
        color="neutral"
        variant="soft"
        :loading="running"
        @click="runNow"
      />
    </div>

    <FlowBuilder
      v-if="flow"
      :catalog="catalog"
      :connections="connections"
      :flow="flow"
    />
    <UAlert
      v-else
      color="error"
      variant="soft"
      title="Flow not found"
    />

    <!-- run history -->
    <div class="mt-12">
      <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-history"
          class="size-4 text-primary"
        />
        Run history
      </h2>

      <p
        v-if="runs.length === 0"
        class="rounded-xl border border-dashed border-default py-8 text-center text-sm text-muted"
      >
        No runs yet. Press “Run now” to try it.
      </p>

      <div
        v-else
        class="space-y-2"
      >
        <div
          v-for="r in runs"
          :key="r.id"
          class="rounded-xl border border-default bg-default"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left"
            @click="expandedRun = expandedRun === r.id ? null : r.id"
          >
            <UBadge
              :color="statusColor(r.status)"
              variant="soft"
              size="sm"
            >
              {{ r.status }}
            </UBadge>
            <span class="text-sm text-muted">{{ r.trigger }}</span>
            <span class="ml-auto text-xs text-dimmed">{{ relTime(r.startedAt) }}</span>
          </button>
          <div
            v-if="expandedRun === r.id"
            class="space-y-1.5 border-t border-default px-4 py-3"
          >
            <p
              v-if="r.error"
              class="text-xs text-error"
            >
              {{ r.error }}
            </p>
            <div
              v-for="(s, i) in (r.steps ?? [])"
              :key="i"
              class="flex items-start gap-2 text-xs"
            >
              <UIcon
                :name="s.status === 'success' ? 'i-lucide-check' : s.status === 'skipped' ? 'i-lucide-minus' : 'i-lucide-x'"
                class="mt-0.5 size-3.5 shrink-0"
                :class="s.status === 'success' ? 'text-success' : s.status === 'skipped' ? 'text-dimmed' : 'text-error'"
              />
              <span class="font-mono text-muted">{{ s.stepId }}</span>
              <span
                v-if="s.error"
                class="text-error"
              >— {{ s.error }}</span>
              <span
                v-else-if="s.logs?.length"
                class="text-dimmed"
              >— {{ s.logs.join('; ') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UContainer>
</template>
