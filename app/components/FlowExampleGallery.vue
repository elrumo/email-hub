<script setup lang="ts">
import { flowExamples } from '~/composables/flowExamples'

defineProps<{
  selectedId?: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

// A soft accent per difficulty, so the gallery reads at a glance rather than as
// a wall of identical cards — the "less intimidating" goal applies here too.
const levelTone: Record<string, { badge: 'success' | 'info' | 'warning', dot: string }> = {
  Starter: { badge: 'success', dot: 'bg-success' },
  Intermediate: { badge: 'info', dot: 'bg-info' },
  Advanced: { badge: 'warning', dot: 'bg-warning' }
}
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <button
      v-for="example in flowExamples"
      :key="example.id"
      type="button"
      class="group relative flex flex-col gap-3 rounded-2xl border bg-default p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
      :class="selectedId === example.id
        ? 'border-primary ring-2 ring-primary/30'
        : 'border-default hover:border-primary/40'"
      @click="emit('select', example.id)"
    >
      <!-- selected check -->
      <span
        v-if="selectedId === example.id"
        class="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-inverted"
      >
        <UIcon
          name="i-lucide-check"
          class="size-3.5"
        />
      </span>

      <div class="flex items-center gap-3">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform group-hover:scale-105">
          <UIcon
            :name="example.icon"
            class="size-5.5"
          />
        </span>
        <div class="min-w-0">
          <p class="truncate font-medium text-highlighted">
            {{ example.name }}
          </p>
          <p class="flex items-center gap-1.5 text-xs text-muted">
            <span
              class="inline-block size-1.5 rounded-full"
              :class="levelTone[example.level]?.dot"
            />
            {{ example.trigger }}
            <span class="text-dimmed">·</span>
            {{ example.stepCount }} {{ example.stepCount === 1 ? 'step' : 'steps' }}
          </p>
        </div>
      </div>

      <p class="line-clamp-2 text-sm leading-relaxed text-muted">
        {{ example.description }}
      </p>

      <div class="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <UBadge
          :color="levelTone[example.level]?.badge ?? 'neutral'"
          variant="soft"
          size="sm"
        >
          {{ example.level }}
        </UBadge>
        <UBadge
          v-for="tag in example.tags"
          :key="tag"
          variant="subtle"
          color="neutral"
          size="sm"
        >
          {{ tag }}
        </UBadge>
      </div>

      <!-- what it needs, kept quiet so it informs without intimidating -->
      <p
        v-if="example.requires?.length"
        class="flex items-center gap-1.5 text-xs text-dimmed"
      >
        <UIcon
          name="i-lucide-plug"
          class="size-3.5 shrink-0"
        />
        <span class="truncate">Needs {{ example.requires.join(', ') }}</span>
      </p>

      <span class="flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        {{ selectedId === example.id ? 'Loaded below' : 'Use this template' }}
        <UIcon
          name="i-lucide-arrow-right"
          class="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </button>
  </div>
</template>
