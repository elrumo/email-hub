<script setup lang="ts">
import { flowExamples } from '~/composables/flowExamples'

defineProps<{
  selectedId?: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    <UCard
      v-for="example in flowExamples"
      :key="example.id"
      :class="selectedId === example.id ? 'ring-2 ring-primary' : ''"
      :ui="{ body: 'p-5' }"
    >
      <div class="flex h-full flex-col gap-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-elevated text-primary">
              <UIcon
                :name="example.icon"
                class="size-5"
              />
            </span>
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">
                {{ example.name }}
              </p>
              <p class="text-xs text-muted">
                {{ example.trigger }} · {{ example.stepCount }} {{ example.stepCount === 1 ? 'step' : 'steps' }}
              </p>
            </div>
          </div>
          <UBadge
            variant="soft"
            size="sm"
            color="neutral"
          >
            {{ example.level }}
          </UBadge>
        </div>

        <p class="text-sm text-muted">
          {{ example.description }}
        </p>

        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="tag in example.tags"
            :key="tag"
            variant="subtle"
            color="primary"
            size="sm"
          >
            {{ tag }}
          </UBadge>
          <UBadge
            v-for="item in (example.requires ?? [])"
            :key="item"
            variant="soft"
            color="warning"
            size="sm"
          >
            {{ item }}
          </UBadge>
        </div>

        <div class="mt-auto pt-2">
          <UButton
            :label="selectedId === example.id ? 'Loaded below' : 'Use example'"
            :variant="selectedId === example.id ? 'soft' : 'outline'"
            color="neutral"
            block
            @click="emit('select', example.id)"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
