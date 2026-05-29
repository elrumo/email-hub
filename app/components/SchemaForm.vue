<script setup lang="ts">
import type { FieldSchema } from '~/types'

// Renders a form from a FieldSchema[]. The single place that maps field types
// to inputs — every integration's connection + action forms flow through here,
// so a new integration needs no new UI. v-model is the values object.
//
// Three capabilities beyond plain fields, all opt-in via the schema (so older
// schemas render exactly as before):
//   - showIf: a field appears only when another field's value matches.
//   - advanced: a field is tucked under a collapsible "Advanced" section.
//   - type "keyValue": an editable string→string map (e.g. custom headers).
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
  return (f.options ?? []).map(o => ({ label: o.label, value: o.value, icon: o.icon, img: o.img }))
}

// A field is shown only if it has no showIf, or its controlling field's current
// value is in the allowed set.
function isVisible(f: FieldSchema): boolean {
  if (!f.showIf) return true
  const current = props.modelValue[f.showIf.field]
  return f.showIf.in.some(allowed => allowed === current)
}

const visible = computed(() => props.schema.filter(isVisible))
const basicFields = computed(() => visible.value.filter(f => !f.advanced))
const advancedFields = computed(() => visible.value.filter(f => f.advanced))

// ---- keyValue (header-style map) editing ----
// We keep an ordered row list per field so typing a key doesn't reorder rows or
// drop a half-typed empty key. Synced back to the model as a plain object.
interface Row { k: string, v: string }
const kvRows = reactive<Record<string, Row[]>>({})

function rowsFor(key: string): Row[] {
  if (!kvRows[key]) {
    const obj = (props.modelValue[key] as Record<string, string> | undefined) ?? {}
    kvRows[key] = Object.entries(obj).map(([k, v]) => ({ k, v: String(v) }))
  }
  return kvRows[key]!
}
function commitRows(key: string) {
  const obj: Record<string, string> = {}
  for (const r of kvRows[key] ?? []) {
    if (r.k.trim()) obj[r.k] = r.v
  }
  set(key, obj)
}
function addRow(key: string) {
  rowsFor(key).push({ k: '', v: '' })
}
function removeRow(key: string, i: number) {
  rowsFor(key).splice(i, 1)
  commitRows(key)
}

// Literal example shown as a hint; built in script to avoid nested-mustache parsing.
const refHint = '{{ steps.x }}'
</script>

<template>
  <div class="space-y-4">
    <!-- A field renderer reused for both basic and advanced sections. -->
    <template
      v-for="f in basicFields"
      :key="f.key"
    >
      <SchemaFormFieldRow
        :field="f"
        :model-value="modelValue"
        :allow-refs="allowRefs"
        :ref-hint="refHint"
        :select-items="selectItems"
        :rows-for="rowsFor"
        :commit-rows="commitRows"
        :add-row="addRow"
        :remove-row="removeRow"
        @set="set"
      />
    </template>

    <UCollapsible
      v-if="advancedFields.length"
      class="border-t border-default pt-2"
    >
      <UButton
        label="Advanced"
        color="neutral"
        variant="link"
        trailing-icon="i-lucide-chevron-down"
        class="group px-0"
        :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
      />
      <template #content>
        <div class="space-y-4 pt-3">
          <SchemaFormFieldRow
            v-for="f in advancedFields"
            :key="f.key"
            :field="f"
            :model-value="modelValue"
            :allow-refs="allowRefs"
            :ref-hint="refHint"
            :select-items="selectItems"
            :rows-for="rowsFor"
            :commit-rows="commitRows"
            :add-row="addRow"
            :remove-row="removeRow"
            @set="set"
          />
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
