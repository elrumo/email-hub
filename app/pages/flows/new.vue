<script setup lang="ts">
import type { Connection } from '~/types'

const { data: catalog } = useCatalog()
const { data: connections } = await useFetch<Connection[]>('/api/connections', {
  key: 'connections',
  default: () => []
})
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
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
    </div>

    <FlowBuilder
      :catalog="catalog"
      :connections="connections"
      :flow="null"
    />
  </UContainer>
</template>
