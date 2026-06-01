<script setup lang="ts">
// Inline-editable flow title (Siri-Shortcuts style): the name reads as a heading
// and turns into an input on click. An optional description sits underneath as a
// quieter, click-to-edit subtitle.
const name = defineModel<string>('name', { default: '' })
const description = defineModel<string>('description', { default: '' })

withDefaults(defineProps<{
  /** Placeholder shown (and used as the visible default) when no name is set. */
  placeholder?: string
}>(), {
  placeholder: 'New flow'
})

const editingName = ref(false)
const editingDesc = ref(false)
const nameInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
const descInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

async function startName() {
  editingName.value = true
  await nextTick()
  nameInput.value?.inputRef?.focus()
  nameInput.value?.inputRef?.select()
}
async function startDesc() {
  editingDesc.value = true
  await nextTick()
  descInput.value?.inputRef?.focus()
}
</script>

<template>
  <div class="min-w-0 flex-1">
    <!-- name -->
    <UInput
      v-if="editingName"
      ref="nameInput"
      v-model="name"
      :placeholder="placeholder"
      variant="none"
      :ui="{ base: 'p-0 text-xl font-semibold tracking-tight text-highlighted' }"
      class="w-full"
      @blur="editingName = false"
      @keydown.enter="editingName = false"
      @keydown.esc="editingName = false"
    />
    <button
      v-else
      type="button"
      class="group flex items-center gap-1.5 text-left"
      @click="startName"
    >
      <h1 class="text-xl font-semibold tracking-tight text-highlighted">
        {{ name || placeholder }}
      </h1>
      <UIcon
        name="i-lucide-pencil"
        class="size-3.5 text-dimmed opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>

    <!-- description -->
    <UInput
      v-if="editingDesc"
      ref="descInput"
      v-model="description"
      placeholder="What does this flow do?"
      variant="none"
      :ui="{ base: 'p-0 text-sm text-muted' }"
      class="w-full"
      @blur="editingDesc = false"
      @keydown.enter="editingDesc = false"
      @keydown.esc="editingDesc = false"
    />
    <button
      v-else
      type="button"
      class="group mt-0.5 flex items-center gap-1.5 text-left"
      @click="startDesc"
    >
      <p
        class="text-sm"
        :class="description ? 'text-muted' : 'text-dimmed'"
      >
        {{ description || 'Add a description' }}
      </p>
      <UIcon
        name="i-lucide-pencil"
        class="size-3 text-dimmed opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  </div>
</template>
