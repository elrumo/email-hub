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

// Name + description are edited inline in the header. They default from the
// draft (AI/template) and otherwise to a friendly "New flow" title, which the
// user can click to rename. Re-seed when the draft changes (e.g. picking a
// template) so the header reflects the new starting point.
const DEFAULT_NAME = 'New flow'
const name = ref(draft.value?.name || DEFAULT_NAME)
const description = ref(draft.value?.description || '')
watch(draft, (d) => {
  name.value = d?.name || DEFAULT_NAME
  description.value = d?.description || ''
})

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
      title: 'Drafted by the assistant',
      body: 'Prefilled from your chat. Review and tweak every step, then save.'
    }
  }
  if (selectedExample.value) {
    return {
      title: `Starting from “${selectedExample.value.name}”`,
      body: 'Prefilled from a template. Swap in your connections and adjust anything before you save.'
    }
  }
  return {
    title: 'A blank flow',
    body: 'Pick when it runs, then add what it should do. You can also browse templates on the Flows page.'
  }
})
</script>

<template>
  <UContainer class="max-w-5xl flex flex-col md:flex-row gap-5 items-start md:gap-10 pb-8 pt-6">
    <div class="mb-6 min-w-0 flex-1 flex-col flex">
      <UButton
        to="/flows"
        icon="i-lucide-arrow-left"
        label="Flows"
        color="neutral"
        variant="ghost"
        size="sm"
        class="-ml-2 mb-3 self-start"
      />
      <!-- name + description: click the title to rename, defaults to "New flow" -->
      <FlowTitleEditor
        v-model:name="name"
        v-model:description="description"
        placeholder="New flow"
      />
    </div>

    <!-- where this flow is starting from -->
    <!-- <div class="mb-8 flex items-start gap-3">
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
    </div> -->

    <FlowBuilder
      :key="selectedExampleId ?? 'blank'"
      v-model:name="name"
      v-model:description="description"
      :catalog="catalog"
      :connections="connections"
      :flow="null"
      :draft="draft"
    />
  </UContainer>
</template>
