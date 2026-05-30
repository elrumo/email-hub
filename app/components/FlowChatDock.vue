<script setup lang="ts">
import type { Connection, IntegrationMeta } from '~/types'
import type { FlowChatApplyPayload } from '~/composables/useFlowChat'

/**
 * Floating presentation of the AI flow chat: a corner button that opens a
 * floating panel containing <FlowChat>. Used as the "floating chat when
 * creating or editing a flow" on the builder pages, and opened by the
 * Claude-style launcher on the flow list.
 */
defineProps<{
  catalog: IntegrationMeta[]
  connections: Connection[]
  /** seeds the conversation when the panel opens */
  initialPrompt?: string
  /** label on the floating launcher button */
  buttonLabel?: string
}>()
const emit = defineEmits<{ apply: [FlowChatApplyPayload] }>()

const open = defineModel<boolean>('open', { default: false })

function onApply(payload: FlowChatApplyPayload) {
  emit('apply', payload)
  open.value = false
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <!-- launcher button -->
      <Transition name="dock-btn">
        <UButton
          v-if="!open"
          :label="buttonLabel ?? 'Ask AI'"
          icon="i-lucide-sparkles"
          size="lg"
          class="fixed bottom-4 right-4 z-[55] rounded-full shadow-lg"
          @click="open = true"
        />
      </Transition>

      <!-- floating panel -->
      <Transition name="dock-panel">
        <div
          v-if="open"
          class="fixed inset-x-3 bottom-3 top-16 z-[60] flex flex-col overflow-hidden rounded-2xl border border-default bg-default shadow-2xl sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(38rem,calc(100dvh-6rem))] sm:w-[26rem]"
        >
          <div class="flex items-center justify-between border-b border-default px-4 py-2.5">
            <div class="flex items-center gap-2">
              <span class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UIcon
                  name="i-lucide-sparkles"
                  class="size-3.5"
                />
              </span>
              <span class="text-sm font-semibold text-highlighted">AI flow assistant</span>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Close assistant"
              @click="open = false"
            />
          </div>

          <FlowChat
            class="min-h-0 flex-1"
            :catalog="catalog"
            :connections="connections"
            :initial-prompt="initialPrompt"
            @apply="onApply"
          />
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.dock-panel-enter-active,
.dock-panel-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.dock-panel-enter-from,
.dock-panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.dock-btn-enter-active,
.dock-btn-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.dock-btn-enter-from,
.dock-btn-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

@media (prefers-reduced-motion: reduce) {
  .dock-panel-enter-active,
  .dock-panel-leave-active,
  .dock-btn-enter-active,
  .dock-btn-leave-active {
    transition: none;
  }
}
</style>
