<script setup lang="ts">
import type { FieldSchema } from '~/types'

// One field of a SchemaForm. Split out of SchemaForm so the same markup serves
// both the basic and the "Advanced" collapsible sections without duplication.
// State lives in the parent; helpers are passed in so there's a single source
// of truth for the values object.
interface Row { k: string, v: string }
defineProps<{
  field: FieldSchema
  modelValue: Record<string, unknown>
  allowRefs?: boolean
  refHint: string
  selectItems: (f: FieldSchema) => Array<{ label: string, value: string | number }>
  rowsFor: (key: string) => Row[]
  commitRows: (key: string) => void
  addRow: (key: string) => void
  removeRow: (key: string, i: number) => void
}>()
const emit = defineEmits<{ set: [key: string, value: unknown] }>()
const set = (key: string, value: unknown) => emit('set', key, value)
</script>

<template>
  <UFormField
    :name="field.key"
    :label="field.label"
    :required="field.required"
    :description="field.help"
  >
    <USelect
      v-if="field.type === 'select'"
      :model-value="(modelValue[field.key] as string | number)"
      :items="selectItems(field)"
      :placeholder="field.placeholder || 'Choose…'"
      class="w-full"
      @update:model-value="set(field.key, $event)"
    />
    <USwitch
      v-else-if="field.type === 'boolean'"
      :model-value="modelValue[field.key] !== false"
      @update:model-value="set(field.key, $event)"
    />
    <UInput
      v-else-if="field.type === 'secret'"
      :model-value="(modelValue[field.key] as string)"
      type="password"
      :placeholder="field.placeholder || '••••••'"
      class="w-full"
      @update:model-value="set(field.key, $event)"
    />
    <UInput
      v-else-if="field.type === 'number'"
      :model-value="(modelValue[field.key] as number)"
      type="number"
      :placeholder="field.placeholder"
      class="w-full"
      @update:model-value="set(field.key, String($event) === '' ? undefined : Number($event))"
    />

    <!-- key/value map editor (e.g. custom HTTP headers) -->
    <div
      v-else-if="field.type === 'keyValue'"
      class="space-y-2"
    >
      <div
        v-for="(row, i) in rowsFor(field.key)"
        :key="i"
        class="flex items-center gap-2"
      >
        <UInput
          v-model="row.k"
          :placeholder="field.placeholder || 'Header'"
          class="flex-1"
          @update:model-value="commitRows(field.key)"
        />
        <UInput
          v-model="row.v"
          placeholder="Value"
          class="flex-1"
          @update:model-value="commitRows(field.key)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Remove"
          @click="removeRow(field.key, i)"
        />
      </div>
      <UButton
        icon="i-lucide-plus"
        :label="rowsFor(field.key).length ? 'Add another' : 'Add'"
        color="neutral"
        variant="soft"
        size="sm"
        @click="addRow(field.key)"
      />
    </div>

    <UInput
      v-else
      :model-value="(modelValue[field.key] as string)"
      :placeholder="field.placeholder"
      class="w-full"
      @update:model-value="set(field.key, $event)"
    />

    <template
      v-if="allowRefs && (field.type === 'string' || field.type === 'number')"
      #hint
    >
      <span class="text-xs text-dimmed">supports <code class="text-muted">{{ refHint }}</code></span>
    </template>
  </UFormField>
</template>
