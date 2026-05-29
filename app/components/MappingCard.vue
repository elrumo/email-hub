<script setup lang="ts">
import { computed } from 'vue'
import {
  cooldownText,
  relTime,
  STATUS_LABELS,
  UNKNOWN
} from '~/composables/format'
import type { IpEntry, Snapshot } from '~/composables/useStatus'

const props = defineProps<{
  fqdn: string
  snapshot: Snapshot
  history: Array<{ ts: number, kuma: number | undefined }>
  cooldownMs: number
}>()
const emit = defineEmits<{
  (e: 'edit' | 'delete'): void
}>()

const SLOTS = 40

const status = computed(() =>
  props.snapshot.kumaStatus !== undefined
    ? STATUS_LABELS[props.snapshot.kumaStatus] ?? UNKNOWN
    : UNKNOWN
)
const hasIssue = computed(
  () => props.snapshot.kumaStatus === 0 || !!props.snapshot.bunnyError
)
// Map the status colour to a concrete dot/text utility so the header reads as a
// single calm indicator rather than a loud badge.
const DOT: Record<string, string> = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
  neutral: 'bg-muted'
}
const dotClass = computed(() => DOT[status.value.color ?? 'neutral'] ?? 'bg-muted')
const statusLabel = computed(() =>
  status.value.label.charAt(0) + status.value.label.slice(1).toLowerCase()
)
const failuresColor = computed(() => {
  const f = props.snapshot.failures ?? 0
  if (f >= 2) return 'text-error'
  if (f >= 1) return 'text-warning'
  return 'text-highlighted'
})
const ips = computed(() => props.snapshot.ips ?? [])
const recent = computed(() => (props.history || []).slice(-SLOTS))
const padding = computed(() => SLOTS - recent.value.length)
const lastSwitchText = computed(() => relTime(props.snapshot.lastSwitchAt))
const cooldownTextValue = computed(() =>
  cooldownText(props.snapshot.lastSwitchAt, props.cooldownMs)
)

// timeline tick background, keyed off the kuma status of each poll
const TICK_BG: Record<number, string> = {
  0: 'bg-error',
  1: 'bg-success',
  2: 'bg-warning',
  3: 'bg-info'
}
function tickClass(kuma: number | undefined) {
  return kuma !== undefined && TICK_BG[kuma]
    ? TICK_BG[kuma]
    : 'bg-muted opacity-25'
}

function ipStatus(ip: IpEntry, active: boolean) {
  if (!ip.present) return 'missing'
  return active ? 'active' : 'standby'
}
</script>

<template>
  <UCard
    variant="subtle"
    :ui="{
      root: hasIssue
        ? 'ring-1 ring-error/30 transition-shadow hover:shadow-lg hover:shadow-black/[0.03]'
        : 'transition-shadow hover:shadow-lg hover:shadow-black/[0.03]',
      body: 'sm:p-6 space-y-6'
    }"
  >
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 space-y-1.5">
        <div class="flex items-center gap-2">
          <span
            class="size-2 shrink-0 rounded-full"
            :class="dotClass"
            :aria-label="statusLabel"
          />
          <span class="text-xs font-medium text-muted">{{ statusLabel }}</span>
        </div>
        <h3 class="text-lg font-semibold tracking-tight text-highlighted break-all leading-snug">
          {{ fqdn }}
        </h3>
        <p class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon
            name="i-lucide-activity"
            class="size-3"
          />
          {{ snapshot.kumaMonitor || "No monitor" }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="Edit mapping"
          @click="emit('edit')"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="Delete mapping"
          :ui="{ base: 'hover:text-error' }"
          @click="emit('delete')"
        />
      </div>
    </div>

    <!-- ips -->
    <div class="space-y-2">
      <p class="text-xs font-medium text-dimmed">
        Origins
      </p>
      <div class="flex flex-col gap-1.5">
        <div
          v-for="ip in ips"
          :key="ip.address"
          class="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ring-1 ring-inset transition-colors"
          :class="ip.address === snapshot.activeIp
            ? (hasIssue ? 'bg-error/5 ring-error/20' : 'bg-success/5 ring-success/20')
            : 'ring-default/60'"
        >
          <span class="flex items-center gap-2.5 min-w-0">
            <UIcon
              v-if="ip.address === snapshot.activeIp"
              name="i-lucide-arrow-right"
              class="size-3.5 shrink-0"
              :class="hasIssue ? 'text-error' : 'text-success'"
            />
            <span
              v-else
              class="size-3.5 shrink-0"
            />
            <span
              class="font-mono tabular-nums truncate"
              :class="ip.address === snapshot.activeIp ? 'text-highlighted' : 'text-muted'"
            >{{ ip.address }}</span>
          </span>
          <span
            class="shrink-0 text-xs font-medium capitalize"
            :class="{
              'text-success': ip.address === snapshot.activeIp && ip.present && !hasIssue,
              'text-error': ip.address === snapshot.activeIp && hasIssue,
              'text-warning': !ip.present,
              'text-dimmed': ip.address !== snapshot.activeIp && ip.present
            }"
          >{{ ipStatus(ip, ip.address === snapshot.activeIp) }}</span>
        </div>
        <div
          v-if="ips.length === 0"
          class="rounded-lg px-3 py-2 text-sm text-dimmed ring-1 ring-inset ring-default/60"
        >
          No IPs configured
        </div>
      </div>
    </div>

    <!-- timeline -->
    <div class="space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-dimmed">Recent polls</span>
        <span class="font-mono tabular-nums text-dimmed">{{ recent.length }}/{{ SLOTS }}</span>
      </div>
      <div class="flex h-5 items-stretch gap-[3px]">
        <div
          v-for="i in padding"
          :key="'p' + i"
          class="min-w-[4px] max-w-[10px] flex-1 rounded-full bg-muted opacity-30"
        />
        <div
          v-for="(t, i) in recent"
          :key="'t' + i"
          class="min-w-[4px] max-w-[10px] flex-1 rounded-full"
          :class="tickClass(t.kuma)"
        />
      </div>
    </div>

    <!-- stats -->
    <dl class="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-default/60">
      <div class="flex flex-col gap-1 bg-elevated/40 px-3 py-3">
        <dt class="text-xs text-dimmed">
          Failures
        </dt>
        <dd
          class="font-mono text-base font-medium tabular-nums"
          :class="failuresColor"
        >
          {{ snapshot.failures ?? 0 }}
        </dd>
      </div>
      <div class="flex flex-col gap-1 bg-elevated/40 px-3 py-3">
        <dt class="text-xs text-dimmed">
          Last switch
        </dt>
        <dd class="font-mono text-base font-medium tabular-nums text-highlighted">
          {{ lastSwitchText }}
        </dd>
      </div>
      <div class="flex flex-col gap-1 bg-elevated/40 px-3 py-3">
        <dt class="text-xs text-dimmed">
          Cooldown
        </dt>
        <dd class="font-mono text-base font-medium tabular-nums text-highlighted">
          {{ cooldownTextValue }}
        </dd>
      </div>
    </dl>

    <UAlert
      v-if="snapshot.bunnyError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`Bunny: ${snapshot.bunnyError}`"
      :ui="{ title: 'break-words' }"
    />
  </UCard>
</template>
