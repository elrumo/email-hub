<script setup lang="ts">
import type { FlowStep, FlowTrigger, IntegrationMeta } from '~/types'
import { collectFlowVariables } from '~/composables/useFlowVariables'

// The "variables" inspector — a Siri-Shortcuts-style list of every value the
// flow makes available (trigger output, each step's output, loop + saved
// values). Tap a chip to copy its {{ ref }} so it can be pasted into any field.
const props = defineProps<{
  catalog: IntegrationMeta[]
  trigger: FlowTrigger
  steps: FlowStep[]
}>()

const toast = useToast()
const groups = computed(() => collectFlowVariables(props.catalog, props.trigger, props.steps))
const total = computed(() => groups.value.reduce((n, g) => n + g.vars.length, 0))

async function copy(ref: string) {
  try {
    await navigator.clipboard.writeText(ref)
    toast.add({ title: 'Copied', description: ref, color: 'success', icon: 'i-lucide-clipboard-check' })
  } catch {
    toast.add({ title: 'Copy failed', description: ref, color: 'error' })
  }
}
</script>

<template>
  <UCollapsible
    :default-open="false"
    class="rounded-2xl border border-default"
  >
    <UButton
      color="neutral"
      variant="ghost"
      block
      trailing-icon="i-lucide-chevron-down"
      class="group justify-between p-4"
      :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
    >
      <span class="flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon
          name="i-lucide-braces"
          class="size-4 text-muted"
        />
        Variables
        <UBadge
          color="neutral"
          variant="soft"
          size="sm"
        >{{ total }}</UBadge>
      </span>
    </UButton>

    <template #content>
      <div class="space-y-5 border-t border-default p-4">
        <p class="text-xs text-muted">
          Values your flow produces. Tap one to copy its reference, then paste it into any field below — like a magic variable.
        </p>

        <div
          v-for="g in groups"
          :key="g.key"
          class="space-y-2"
        >
          <div class="flex items-center gap-1.5 text-xs font-medium text-dimmed">
            <UIcon
              :name="g.icon"
              class="size-3.5"
            />
            {{ g.label }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="v in g.vars"
              :key="v.ref"
              type="button"
              class="group/chip inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:bg-primary/10"
              :title="`${v.source} — click to copy ${v.ref}`"
              @click="copy(v.ref)"
            >
              <span class="font-mono text-highlighted">{{ v.name }}</span>
              <UIcon
                name="i-lucide-copy"
                class="size-3 text-dimmed group-hover/chip:text-primary"
              />
            </button>
          </div>
        </div>

        <p
          v-if="groups.length === 0"
          class="text-xs text-dimmed"
        >
          No variables yet — add a step that produces output (like a web request) and it’ll show up here.
        </p>
      </div>
    </template>
  </UCollapsible>
</template>
