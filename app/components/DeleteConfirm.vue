<script setup lang="ts">
import { ref } from 'vue'
import { errorMessage } from '~/composables/useStatus'

const props = defineProps<{
  fqdn: string
}>()
const emit = defineEmits<{
  (e: 'close' | 'confirmed'): void
}>()

const open = ref(true)
function onOpenChange(value: boolean) {
  if (!value) emit('close')
}

const deleting = ref(false)
const error = ref<string | null>(null)

async function confirm() {
  deleting.value = true
  error.value = null
  try {
    const res = await fetch(`/api/mappings/${encodeURIComponent(props.fqdn)}`, {
      method: 'DELETE'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.statusMessage || res.statusText)
    }
    emit('confirmed')
  } catch (e) {
    error.value = errorMessage(e, 'delete failed')
    deleting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Delete Mapping"
    description="Remove this hostname from the managed mappings."
    :ui="{ content: 'max-w-md', footer: 'justify-end' }"
    @update:open="onOpenChange"
  >
    <template #body>
      <div class="space-y-3 text-sm">
        <p class="text-default">
          Remove <span class="font-mono font-medium text-highlighted break-all">{{ fqdn }}</span> from managed mappings?
        </p>
        <p class="text-muted">
          This only removes the script's awareness of the mapping. It does not
          modify the Bunny DNS records — they stay in whatever state they're
          currently in.
        </p>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="error"
        />
      </div>
    </template>

    <template #footer="{ close }">
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="close"
      />
      <UButton
        label="Delete Mapping"
        color="error"
        icon="i-lucide-trash-2"
        :loading="deleting"
        @click="confirm"
      />
    </template>
  </UModal>
</template>
