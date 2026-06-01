<script setup lang="ts">
// The "Create new flow" entry point. Instead of dumping a templates wall on the
// home screen, the example flows live here — tucked inside a popover that opens
// from the primary action, with "Start from scratch" sitting above them.
import { flowExamples } from '~/composables/flowExamples'

const emit = defineEmits<{
  scratch: []
  example: [id: string]
}>()

const open = ref(false)

// soft accent per difficulty so the list reads at a glance (matches the old
// gallery's tone mapping)
const levelDot: Record<string, string> = {
  Starter: 'bg-success',
  Intermediate: 'bg-info',
  Advanced: 'bg-warning'
}

function pickScratch() {
  open.value = false
  emit('scratch')
}

function pickExample(id: string) {
  open.value = false
  emit('example', id)
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'end' }"
  >
    <UButton
      icon="i-lucide-plus"
      label="Create new flow"
      trailing-icon="i-lucide-chevron-down"
      class="rounded-full"
    />

    <template #content>
      <div class="w-[min(92vw,26rem)] p-2">
        <!-- start from scratch -->
        <button
          type="button"
          class="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-elevated"
          @click="pickScratch"
        >
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform group-hover:scale-105">
            <UIcon
              name="i-lucide-pencil-line"
              class="size-5"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-highlighted">
              Start from scratch
            </span>
            <span class="block truncate text-xs text-muted">
              A blank flow you build step by step.
            </span>
          </span>
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>

        <!-- separator -->
        <p class="px-2.5 pb-1.5 pt-3 text-xs font-medium uppercase tracking-wide text-dimmed">
          Or start from a template
        </p>

        <!-- example flows as cards -->
        <div class="max-h-[min(60vh,24rem)] space-y-0.5 overflow-y-auto">
          <button
            v-for="example in flowExamples"
            :key="example.id"
            type="button"
            class="group flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-elevated"
            @click="pickExample(example.id)"
          >
            <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted ring-1 ring-default transition-transform group-hover:scale-105 group-hover:text-primary">
              <UIcon
                :name="example.icon"
                class="size-5"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span class="truncate font-medium text-highlighted">
                  {{ example.name }}
                </span>
                <span
                  class="inline-block size-1.5 shrink-0 rounded-full"
                  :class="levelDot[example.level]"
                  :title="example.level"
                />
              </span>
              <span class="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-muted">
                {{ example.description }}
              </span>
              <span class="mt-1 block truncate text-[0.7rem] text-dimmed">
                {{ example.trigger }} · {{ example.stepCount }} {{ example.stepCount === 1 ? 'step' : 'steps' }}
              </span>
            </span>
            <UIcon
              name="i-lucide-arrow-right"
              class="mt-0.5 size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
