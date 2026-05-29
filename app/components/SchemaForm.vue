<script setup lang="ts">
import type { FieldSchema } from '~/types'

// Renders a form from a FieldSchema[]. The single place that maps field types
// to inputs — every integration's connection + action forms flow through here,
// so a new integration needs no new UI. v-model is the values object.
const props = defineProps<{
  schema: FieldSchema[]
  modelValue: Record<string, unknown>
  /** show a small "you can use {{ steps.x }}" hint on text fields */
  allowRefs?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>] }>()

function set(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function selectItems(f: FieldSchema) {
  return (f.options ?? []).map(o => ({ label: o.label, value: o.value }))
}

// Literal example shown as a hint; built in script to avoid nested-mustache parsing.
const refHint = '{{ steps.x }}'
</script>

<template>
  <div class="space-y-4">
    <UFormField
      v-for="f in schema"
      :key="f.key"
      :name="f.key"
      :label="f.label"
      :required="f.required"
      :description="f.help"
    >
      <USelect
        v-if="f.type === 'select'"
        :model-value="(modelValue[f.key] as string | number)"
        :items="selectItems(f)"
        :placeholder="f.placeholder || 'Choose…'"
        class="w-full"
        @update:model-value="set(f.key, $event)"
      />
      <USwitch
        v-else-if="f.type === 'boolean'"
        :model-value="modelValue[f.key] !== false"
        @update:model-value="set(f.key, $event)"
      />
      <UInput
        v-else-if="f.type === 'secret'"
        :model-value="(modelValue[f.key] as string)"
        type="password"
        :placeholder="f.placeholder || '••••••'"
        class="w-full"
        @update:model-value="set(f.key, $event)"
      />
      <UInput
        v-else-if="f.type === 'number'"
        :model-value="(modelValue[f.key] as number)"
        type="number"
        :placeholder="f.placeholder"
        class="w-full"
        @update:model-value="set(f.key, String($event) === '' ? undefined : Number($event))"
      />
      <UInput
        v-else
        :model-value="(modelValue[f.key] as string)"
        :placeholder="f.placeholder"
        class="w-full"
        @update:model-value="set(f.key, $event)"
      />

      <template
        v-if="allowRefs && (f.type === 'string' || f.type === 'number')"
        #hint
      >
        <span class="text-xs text-dimmed">supports <code class="text-muted">{{ refHint }}</code></span>
      </template>
    </UFormField>
  </div>
</template>
