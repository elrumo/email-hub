<script setup lang="ts">
import type { ConditionExpr, Comparison } from '~/types'
import { OPERATORS } from '~/composables/builder'

const props = defineProps<{ modelValue: ConditionExpr }>()
const emit = defineEmits<{ 'update:modelValue': [ConditionExpr] }>()

// operators that don't take a right-hand value
const NO_RHS = new Set(['exists', 'notExists', 'truthy', 'falsy'])

function update(all: Comparison[]) {
  emit('update:modelValue', { all })
}
function setRow(i: number, patch: Partial<Comparison>) {
  const all = props.modelValue.all.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
  update(all)
}
function addRow() {
  update([...props.modelValue.all, { left: '', op: 'eq', right: '' }])
}
function removeRow(i: number) {
  update(props.modelValue.all.filter((_, idx) => idx !== i))
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(c, i) in modelValue.all"
      :key="i"
      class="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <span
        v-if="i > 0"
        class="text-xs font-medium uppercase text-dimmed sm:w-8 sm:shrink-0"
      >and</span>
      <UInput
        :model-value="c.left"
        placeholder="{{ steps.x.field }}"
        size="sm"
        class="w-full sm:flex-1"
        @update:model-value="setRow(i, { left: $event })"
      />
      <div class="flex items-center gap-2">
        <USelect
          :model-value="c.op"
          :items="OPERATORS"
          size="sm"
          class="w-full sm:w-44 sm:shrink-0"
          @update:model-value="setRow(i, { op: $event as Comparison['op'] })"
        />
        <UInput
          v-if="!NO_RHS.has(c.op)"
          :model-value="(c.right as string)"
          placeholder="value"
          size="sm"
          class="w-full sm:flex-1"
          @update:model-value="setRow(i, { right: $event })"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0"
          :disabled="modelValue.all.length === 1"
          aria-label="Remove condition"
          @click="removeRow(i)"
        />
      </div>
    </div>
    <UButton
      icon="i-lucide-plus"
      label="Add condition"
      color="neutral"
      variant="ghost"
      size="xs"
      @click="addRow"
    />
  </div>
</template>
