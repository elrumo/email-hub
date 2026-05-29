<script setup lang="ts">
import type { AdminStats, AdminUserSummary } from '~/types'

const { data: totals } = await useFetch<AdminStats>('/api/admin/stats', { key: 'admin-stats' })
const { data: users } = await useFetch<AdminUserSummary[]>('/api/admin/users', {
  key: 'admin-users',
  default: () => []
})

const totalCards = computed(() => {
  const t = totals.value
  if (!t) return []
  return [
    { label: 'Users', value: t.users, icon: 'i-lucide-users' },
    { label: 'Flows', value: t.flows, icon: 'i-lucide-workflow' },
    { label: 'Connections', value: t.connections, icon: 'i-lucide-plug' },
    { label: 'Monitors', value: t.monitors, icon: 'i-lucide-activity' },
    { label: 'Flow runs', value: t.flowRuns, icon: 'i-lucide-play' }
  ]
})
</script>

<template>
  <UContainer class="py-8">
    <h1 class="mb-6 text-xl font-semibold tracking-tight text-highlighted">
      Admin overview
    </h1>

    <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <UCard
        v-for="c in totalCards"
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

    <UCard :ui="{ body: 'p-0' }">
      <template #header>
        <h2 class="font-medium text-highlighted">
          Users
        </h2>
      </template>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2.5 font-medium">
                User
              </th>
              <th class="px-4 py-2.5 font-medium">
                Role
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                Flows
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                Connections
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                Runs
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                Failed
              </th>
              <th class="px-4 py-2.5 font-medium">
                Last login
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="u in users"
              :key="u.id"
            >
              <td class="px-4 py-2.5">
                <div class="font-medium text-highlighted">
                  {{ u.username }}
                </div>
                <div
                  v-if="u.email"
                  class="text-xs text-dimmed"
                >
                  {{ u.email }}
                </div>
              </td>
              <td class="px-4 py-2.5">
                <UBadge
                  :color="u.role === 'admin' ? 'primary' : 'neutral'"
                  variant="soft"
                  :label="u.role"
                />
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">
                {{ u.stats.flowsCreated }}
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">
                {{ u.stats.connectionsCount }}
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">
                {{ u.stats.flowRunsTotal }}
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">
                <span :class="u.stats.flowRunError ? 'text-error' : 'text-dimmed'">{{ u.stats.flowRunError }}</span>
              </td>
              <td class="px-4 py-2.5 text-muted">
                {{ relTime(u.lastLoginAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </UContainer>
</template>
