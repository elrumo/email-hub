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
const draft = computed(() => buildFlowExampleDraft(selectedExampleId.value))

function chooseExample(id: string) {
  router.replace({ query: { ...route.query, example: id } })
}

function clearExample() {
  const query = { ...route.query }
  delete query.example
  router.replace({ query })
}
</script>

<template>
  <UContainer class="max-w-6xl py-10 sm:py-14">
    <div class="mb-8">
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
        New flow
      </h1>
      <p class="mt-1 text-sm text-muted">
        Start blank, or pick an example and turn it into your own automation.
      </p>
    </div>

    <div class="mb-8 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            Example flows
          </h2>
          <p class="text-sm text-muted">
            These load into the builder as editable drafts, so you can swap connections, tweak steps, and save.
          </p>
        </div>
        <UButton
          v-if="selectedExample"
          label="Start blank"
          color="neutral"
          variant="outline"
          @click="clearExample"
        />
      </div>

      <UAlert
        v-if="selectedExample"
        color="primary"
        variant="soft"
        icon="i-lucide-sparkles"
        :title="`Loaded: ${selectedExample.name}`"
        description="The builder below is prefilled with this example. Everything stays editable before you save."
      />

      <FlowExampleGallery
        :selected-id="selectedExampleId"
        @select="chooseExample"
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
