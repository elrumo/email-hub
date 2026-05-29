<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { relTime } from '~/composables/format'
import type { StatusData } from '~/composables/useStatus'

const props = defineProps<{
  data: StatusData
  offline: boolean
}>()
const emit = defineEmits<{
  (e: 'add' | 'check'): void
}>()

const toast = useToast()

const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  clockTimer = setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})

const clockText = computed(() => {
  const d = now.value
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':')
})

const stale = computed(() => {
  if (props.offline) return true
  if (!props.data.lastTickAt) return true
  const tickAge = Date.now() - props.data.lastTickAt
  return tickAge > Math.max(90_000, (props.data.pollIntervalMs || 30_000) * 3)
})

const liveLabel = computed(() => {
  if (props.offline) return 'Offline'
  return stale.value ? 'Stale' : 'Live'
})
const liveColor = computed(() => (stale.value ? 'error' : 'success'))

const statusLine = computed(() => {
  const parts: string[] = []
  if (props.data.lastTickAt) parts.push(`Last poll ${relTime(props.data.lastTickAt)}`)
  parts.push(
    props.data.lastKumaError ? `Kuma error: ${props.data.lastKumaError}` : 'Kuma reachable'
  )
  return parts.join(' · ')
})

const checking = ref(false)
async function onCheck() {
  if (checking.value) return
  checking.value = true
  try {
    await fetch('/api/trigger', { method: 'POST' })
    await new Promise(r => setTimeout(r, 400))
    emit('check')
    toast.add({
      title: 'Check triggered',
      description: 'Re-polled all monitors.',
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
  } catch {
    toast.add({
      title: 'Check failed',
      description: 'Could not trigger a poll.',
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <header class="mb-10">
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div class="space-y-2">
        <div class="flex items-center gap-2.5">
          <span
            class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
            :class="liveColor === 'success'
              ? 'bg-success/10 text-success ring-success/20'
              : 'bg-error/10 text-error ring-error/20'"
          >
            <span
              class="size-1.5 rounded-full"
              :class="[liveColor === 'success' ? 'bg-success' : 'bg-error', stale ? '' : 'pulse-dot']"
            />
            {{ liveLabel }}
          </span>
          <span class="font-mono text-sm tabular-nums text-muted">{{ clockText }}</span>
        </div>

        <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
          Failover Monitor
        </h1>
        <p class="text-sm text-muted">
          {{ statusLine }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          label="Check Now"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="checking"
          @click="onCheck"
        />
        <UButton
          label="Add Mapping"
          color="primary"
          icon="i-lucide-plus"
          @click="emit('add')"
        />
      </div>
    </div>
  </header>
</template>

<style scoped>
@keyframes breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.pulse-dot {
  animation: breathe 2.4s ease-in-out infinite;
}
</style>
