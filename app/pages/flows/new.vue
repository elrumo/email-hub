<script setup lang="ts">
import type { Connection } from '~/types'
import { buildFlowExampleDraft, getFlowExample } from '~/composables/flowExamples'

const { data: catalog } = useCatalog()
const { data: connections } = await useFetch<Connection[]>('/api/connections', {
  key: 'connections',
  default: () => []
})
const route = useRoute()
const router = useRouter()

const selectedExampleId = computed(() => {
  const raw = route.query.example
  return typeof raw === 'string' ? raw : null
})
const selectedExample = computed(() => getFlowExample(selectedExampleId.value))

// An AI-proposed flow handed over from the list launcher. Consume it once so a
// refresh starts blank again.
const pendingDraft = usePendingFlowDraft()
const aiDraft = pendingDraft.value
if (aiDraft) pendingDraft.value = null

const draft = computed(() => aiDraft ?? buildFlowExampleDraft(selectedExampleId.value))

function clearExample() {
  const query = { ...route.query }
  delete query.example
  router.replace({ query })
}

// A friendly one-line summary of where this flow is starting from — blank, a
// template, or an AI draft. Keeps the top of the builder reassuring rather than
// a wall of empty fields (Siri Shortcuts "start" feel).
const startFrom = computed(() => {
  if (aiDraft) {
    return {
      icon: 'i-lucide-sparkles',
      title: 'Drafted by the assistant',
      body: 'Prefilled from your chat. Review and tweak every step, then save.'
    }
  }
  if (selectedExample.value) {
    return {
      icon: selectedExample.value.icon,
      title: `Starting from “${selectedExample.value.name}”`,
      body: 'Prefilled from a template. Swap in your connections and adjust anything before you save.'
    }
  }
  return {
    icon: 'i-lucide-wand-2',
    title: 'A blank flow',
    body: 'Pick when it runs, then add what it should do. You can also browse templates on the Flows page.'
  }
})
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-6">
      <UButton
        to="/flows"
        icon="i-lucide-arrow-left"
        label="Flows"
        color="neutral"
        variant="ghost"
        size="sm"
        class="-ml-2 mb-3"
      />
      <h1 class="text-xl font-semibold tracking-tight text-highlighted">
        New flow
      </h1>
      <p class="mt-1 text-sm text-muted">
        A flow is just a trigger — <span class="text-highlighted">when</span> it runs — and a short list of actions — <span class="text-highlighted">what</span> it does.
      </p>
    </div>

    <!-- where this flow is starting from -->
    <div class="mb-8 flex items-start gap-3 rounded-2xl border border-default bg-elevated/40 p-4">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <UIcon
          :name="startFrom.icon"
          class="size-5"
        />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-highlighted">
          {{ startFrom.title }}
        </p>
        <p class="text-sm text-muted">
          {{ startFrom.body }}
        </p>
      </div>
      <UButton
        v-if="selectedExample"
        label="Start blank"
        icon="i-lucide-eraser"
        color="neutral"
        variant="ghost"
        size="sm"
        class="shrink-0"
        @click="clearExample"
      />
    </div>

    <FlowBuilder
      :key="selectedExampleId ?? 'blank'"
      :catalog="catalog"
      :connections="connections"
      :flow="null"
      :draft="draft"
    />
  </UContainer>
</template>
