<script setup lang="ts">
import type { PingState } from '~/composables/usePing'
import type { Shortcut } from '~/types'

const { shortcut, ping } = defineProps<{
  shortcut: Shortcut
  /** live ping state, when the parent is polling */
  ping?: PingState
}>()

defineEmits<{ edit: [], delete: [] }>()

// strip protocol for a compact display host
const host = computed(() => {
  try {
    return new URL(shortcut.url).host
  } catch {
    return shortcut.url
  }
})
</script>

<template>
  <UCard
    variant="sm"
    :ui="{ body: 'flex items-center gap-3' }"
  >
    <div class="group flex w-full items-center gap-3">
      <a
        :href="shortcut.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated text-muted transition-colors hover:text-primary"
      >
        <img
          v-if="isImageIcon(shortcut.icon)"
          :src="shortcut.icon"
          alt=""
          class="size-5 rounded"
        >
        <UIcon
          v-else
          :name="shortcut.icon || 'i-lucide-link'"
          class="size-5"
        />
      </a>

      <div class="min-w-0 flex-1">
        <a
          :href="shortcut.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 truncate font-medium text-highlighted hover:text-primary"
        >
          <span class="truncate">{{ shortcut.name }}</span>
          <UIcon
            name="i-lucide-external-link"
            class="size-3.5 shrink-0 text-dimmed"
          />
        </a>
        <p class="mt-0.5 flex items-center gap-2 text-sm text-muted">
          <span class="truncate text-dimmed">{{ host }}</span>
          <PingDot
            v-if="shortcut.pingEnabled"
            :state="ping"
          />
        </p>
      </div>

      <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Edit"
          @click="$emit('edit')"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="sm"
          aria-label="Delete"
          @click="$emit('delete')"
        />
      </div>
    </div>
  </UCard>
</template>
