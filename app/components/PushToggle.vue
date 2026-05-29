<script setup lang="ts">
// Header bell: enable/disable Web Push for THIS device, and fire a test push.
// Notifications must be enabled here before any flow action or "notify on run"
// setting can reach this browser.
const { supported, enabled, permission, busy, refresh, enable, disable, sendTest } = usePush()
const toast = useToast()

onMounted(refresh)

const open = ref(false)

async function onEnable() {
  const res = await enable()
  if (res.ok) {
    toast.add({ title: 'Notifications enabled on this device', color: 'success' })
    open.value = false
  } else {
    toast.add({ title: res.message ?? 'Could not enable notifications', color: 'error' })
  }
}

async function onDisable() {
  await disable()
  toast.add({ title: 'Notifications disabled on this device', color: 'neutral' })
  open.value = false
}

async function onTest() {
  try {
    const { sent } = await sendTest()
    toast.add({
      title: sent > 0 ? 'Test notification sent' : 'No subscribed devices',
      color: sent > 0 ? 'success' : 'warning'
    })
  } catch {
    toast.add({ title: 'Test failed', color: 'error' })
  }
}
</script>

<template>
  <UPopover
    v-if="supported"
    v-model:open="open"
  >
    <UButton
      :icon="enabled ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
      :color="enabled ? 'primary' : 'neutral'"
      variant="ghost"
      aria-label="Notifications"
    />
    <template #content>
      <div class="w-72 space-y-3 p-4">
        <div class="flex items-center gap-2">
          <UIcon
            :name="enabled ? 'i-lucide-bell-ring' : 'i-lucide-bell-off'"
            class="size-4 text-muted"
          />
          <p class="text-sm font-medium text-highlighted">
            Browser notifications
          </p>
        </div>
        <p class="text-xs text-muted">
          Get notified on this device when a flow runs, or from a "Send a browser notification" step.
        </p>

        <UAlert
          v-if="permission === 'denied'"
          color="error"
          variant="soft"
          icon="i-lucide-x-circle"
          title="Blocked"
          description="Notifications are blocked for this site. Re-enable them in your browser's site settings, then reload."
          :ui="{ description: 'text-xs' }"
        />

        <div
          v-else
          class="flex flex-col gap-2"
        >
          <UButton
            v-if="!enabled"
            label="Enable on this device"
            icon="i-lucide-bell-ring"
            block
            :loading="busy"
            @click="onEnable"
          />
          <template v-else>
            <UButton
              label="Send a test"
              icon="i-lucide-send"
              color="neutral"
              variant="soft"
              block
              @click="onTest"
            />
            <UButton
              label="Disable on this device"
              icon="i-lucide-bell-off"
              color="neutral"
              variant="ghost"
              block
              :loading="busy"
              @click="onDisable"
            />
          </template>
        </div>
      </div>
    </template>
  </UPopover>
</template>
