<script setup lang="ts">
import type { ActivityEntry, PublicUser, UserStats } from '~/types'

const auth = useAuth()
const toast = useToast()

const { data: stats } = await useFetch<UserStats>('/api/me/stats', { key: 'me-stats' })
const { data: activity } = await useFetch<ActivityEntry[]>('/api/me/activity', {
  key: 'me-activity',
  default: () => []
})

// profile (email)
const email = ref(auth.user.value?.email ?? '')
const savingProfile = ref(false)
async function saveProfile() {
  savingProfile.value = true
  try {
    const res = await $fetch<{ user: PublicUser }>('/api/me', { method: 'PUT', body: { email: email.value } })
    auth.user.value = res.user
    toast.add({ title: 'Profile saved', color: 'success' })
  } catch (e) {
    toast.add({ title: (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Save failed', color: 'error' })
  } finally {
    savingProfile.value = false
  }
}

// password change
const currentPassword = ref('')
const newPassword = ref('')
const savingPassword = ref(false)
async function changePassword() {
  if (newPassword.value.length < 8) return
  savingPassword.value = true
  try {
    await $fetch('/api/me/password', {
      method: 'PUT',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
    })
    currentPassword.value = ''
    newPassword.value = ''
    toast.add({ title: 'Password changed', color: 'success' })
  } catch (e) {
    toast.add({ title: (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Change failed', color: 'error' })
  } finally {
    savingPassword.value = false
  }
}

const statCards = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: 'Flows', value: s.flowsCreated, icon: 'i-lucide-workflow' },
    { label: 'Connections', value: s.connectionsCount, icon: 'i-lucide-plug' },
    { label: 'Monitors', value: s.monitorsCount, icon: 'i-lucide-activity' },
    { label: 'Total runs', value: s.flowRunsTotal, icon: 'i-lucide-play' },
    { label: 'Successful', value: s.flowRunSuccess, icon: 'i-lucide-check' },
    { label: 'Failed', value: s.flowRunError, icon: 'i-lucide-x' }
  ]
})
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-8 flex items-center gap-3 animate-rise">
      <UAvatar
        :alt="auth.user.value?.username"
        size="lg"
        icon="i-lucide-user"
      />
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          {{ auth.user.value?.username }}
        </h1>
        <p class="text-sm text-muted">
          <UBadge
            v-if="auth.user.value?.role === 'admin'"
            color="primary"
            variant="soft"
            label="Admin"
            class="mr-1"
          />
          Joined {{ relTime(auth.user.value?.createdAt) }} · last login {{ relTime(auth.user.value?.lastLoginAt) }}
        </p>
      </div>
    </div>

    <!-- stats -->
    <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 stagger">
      <UCard
        v-for="c in statCards"
        :key="c.label"
        :ui="{ body: 'p-4' }"
      >
        <div class="flex items-center gap-2 text-muted">
          <UIcon
            :name="c.icon"
            class="size-4"
          />
          <span class="text-xs">{{ c.label }}</span>
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted">
          {{ c.value }}
        </p>
      </UCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- profile + password -->
      <div class="flex flex-col gap-6">
        <UCard>
          <template #header>
            <h2 class="font-medium text-highlighted">
              Profile
            </h2>
          </template>
          <form
            class="flex flex-col gap-4"
            @submit.prevent="saveProfile"
          >
            <UFormField label="Email">
              <UInput
                v-model="email"
                type="email"
                placeholder="you@example.com"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              :loading="savingProfile"
              label="Save profile"
              class="self-start"
            />
          </form>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium text-highlighted">
              Change password
            </h2>
          </template>
          <form
            class="flex flex-col gap-4"
            @submit.prevent="changePassword"
          >
            <UFormField label="Current password">
              <UInput
                v-model="currentPassword"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="New password"
              description="At least 8 characters."
            >
              <UInput
                v-model="newPassword"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              :loading="savingPassword"
              label="Update password"
              class="self-start"
            />
          </form>
        </UCard>
      </div>

      <!-- activity -->
      <UCard :ui="{ body: 'p-0' }">
        <template #header>
          <h2 class="font-medium text-highlighted">
            Recent activity
          </h2>
        </template>
        <div
          v-if="!activity?.length"
          class="p-6 text-center text-sm text-muted"
        >
          No activity yet.
        </div>
        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="a in activity"
            :key="a.id"
            class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
          >
            <span class="font-mono text-muted">{{ a.action }}</span>
            <span class="shrink-0 text-xs text-dimmed">{{ relTime(a.createdAt) }}</span>
          </li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>
