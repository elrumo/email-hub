<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Admin — Postcard' })

interface AdminUser {
  id: string
  email: string
  name: string | null
  role: string
  plan: string
  planStatus: string | null
  projects: number
  projectLimit: number
  aiMessagesThisMonth: number
  aiMessageLimit: number
  aiTokensThisMonth: number
  lastLoginAt: number | null
  createdAt: number
}

interface Overview {
  stats: {
    users: number
    activeLast30d: number
    projects: number
    aiMessagesThisMonth: number
    aiTokensThisMonth: number
    paidSubscriptions: number
    planCounts: Record<string, number>
  }
  users: AdminUser[]
}

const { data, error } = await useFetch<Overview>('/api/admin/overview')

interface TriggerRow {
  key: string
  label: string
  description: string
  projectId: string | null
  enabled: boolean
  inactiveAfterMonths: number | null
}

interface TriggersPayload {
  mailerConfigured: boolean
  templates: Array<{ id: string, name: string }>
  triggers: TriggerRow[]
}

const { data: triggerData } = await useFetch<TriggersPayload>('/api/admin/triggers')
const savingTrigger = ref<string | null>(null)
const triggerError = ref('')

const templateItems = computed(() =>
  (triggerData.value?.templates ?? []).map(t => ({ label: t.name, value: t.id }))
)

async function saveTrigger(row: TriggerRow) {
  triggerError.value = ''
  savingTrigger.value = row.key
  try {
    await $fetch('/api/admin/triggers', {
      method: 'PUT',
      body: {
        trigger: row.key,
        projectId: row.projectId,
        enabled: row.enabled,
        inactiveAfterMonths: row.inactiveAfterMonths
      }
    })
  } catch (e: any) {
    triggerError.value = e?.data?.statusMessage || 'Could not save the trigger.'
  } finally {
    savingTrigger.value = null
  }
}

const search = ref('')
const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  const users = data.value?.users ?? []
  if (!q) return users
  return users.filter(u => u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q))
})

const cards = computed(() => [
  { label: 'Users', value: data.value?.stats.users ?? 0, icon: 'i-lucide-users', color: 'text-primary-500', hint: `${data.value?.stats.activeLast30d ?? 0} active in 30 days` },
  { label: 'Paid subscriptions', value: data.value?.stats.paidSubscriptions ?? 0, icon: 'i-lucide-credit-card', color: 'text-green-500', hint: planBreakdown.value },
  { label: 'Email projects', value: data.value?.stats.projects ?? 0, icon: 'i-lucide-layout-grid', color: 'text-purple-500', hint: 'across all users' },
  { label: 'AI messages this month', value: data.value?.stats.aiMessagesThisMonth ?? 0, icon: 'i-lucide-sparkles', color: 'text-amber-500', hint: `${(data.value?.stats.aiTokensThisMonth ?? 0).toLocaleString()} tokens` }
])

const planBreakdown = computed(() => {
  const counts = data.value?.stats.planCounts ?? {}
  return Object.entries(counts).map(([plan, n]) => `${n} ${plan}`).join(' · ') || '—'
})

function fmtDate(ts: number | null | undefined) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const planColor: Record<string, string> = {
  free: 'neutral',
  starter: 'primary',
  pro: 'success'
}
</script>

<template>
  <div class="p-8 max-w-6xl mx-auto space-y-6">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Admin</h1>
        <p class="pc-dim text-sm mt-1">Users, plans and usage across the whole workspace.</p>
      </div>
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search users…" class="w-64" />
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error.data?.statusMessage || 'Could not load admin data.'" />

    <template v-else>
      <!-- Stat cards -->
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="c in cards" :key="c.label" class="pc-card p-5">
          <div class="flex items-center gap-2 text-xs pc-dim uppercase tracking-wide">
            <UIcon :name="c.icon" class="w-4 h-4" :class="c.color" />
            {{ c.label }}
          </div>
          <div class="text-2xl font-semibold mt-2">{{ c.value.toLocaleString() }}</div>
          <div class="text-[11px] pc-dim mt-1">{{ c.hint }}</div>
        </div>
      </div>

      <!-- Trigger emails -->
      <div class="pc-card overflow-hidden">
        <div class="px-5 py-4 border-b pc-hairline">
          <div class="font-medium">Trigger emails</div>
          <p class="text-xs pc-dim mt-0.5">Pick which of your email templates is sent for each lifecycle event. Variables like <code v-pre>{{ firstName }}</code>, <code v-pre>{{ name }}</code>, <code v-pre>{{ email }}</code> and <code v-pre>{{ plan }}</code> are filled from the recipient.</p>
        </div>

        <UAlert
          v-if="triggerData && !triggerData.mailerConfigured"
          color="warning"
          variant="soft"
          class="m-4"
          icon="i-lucide-mail-warning"
          title="SMTP is not configured"
          description="Set the NUXT_MAIL_* environment variables to actually deliver these emails. Until then, sends are only logged on the server."
        />
        <UAlert v-if="triggerError" color="error" variant="soft" class="mx-4 mb-2" :title="triggerError" />

        <div class="divide-y divide-(--pc-border)">
          <div v-for="row in triggerData?.triggers ?? []" :key="row.key" class="px-5 py-4 flex flex-wrap items-center gap-4">
            <div class="min-w-0 flex-1 basis-56">
              <div class="font-medium text-sm">{{ row.label }}</div>
              <div class="text-xs pc-dim mt-0.5">{{ row.description }}</div>
            </div>
            <div v-if="row.key === 'inactive'" class="flex items-center gap-2 text-sm">
              <span class="pc-dim text-xs">after</span>
              <UInput
                v-model.number="row.inactiveAfterMonths"
                type="number"
                min="1"
                max="24"
                class="w-20"
                size="sm"
                @change="saveTrigger(row)"
              />
              <span class="pc-dim text-xs">months</span>
            </div>
            <USelect
              :model-value="row.projectId ?? undefined"
              :items="templateItems"
              placeholder="Choose a template…"
              class="w-56"
              size="sm"
              @update:model-value="(v: any) => { row.projectId = v || null; saveTrigger(row) }"
            />
            <USwitch
              v-model="row.enabled"
              :disabled="!row.projectId"
              :loading="savingTrigger === row.key"
              @update:model-value="saveTrigger(row)"
            />
          </div>
        </div>
      </div>

      <!-- Users table -->
      <div class="pc-card overflow-hidden">
        <div class="px-5 py-4 border-b pc-hairline flex items-center justify-between">
          <div class="font-medium">Users</div>
          <div class="text-xs pc-dim">{{ filteredUsers.length }} shown</div>
        </div>
        <div class="overflow-x-auto pc-scroll">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs pc-dim uppercase tracking-wide border-b pc-hairline">
                <th class="px-5 py-3 font-medium">User</th>
                <th class="px-4 py-3 font-medium">Plan</th>
                <th class="px-4 py-3 font-medium">Projects</th>
                <th class="px-4 py-3 font-medium">AI this month</th>
                <th class="px-4 py-3 font-medium">Tokens</th>
                <th class="px-4 py-3 font-medium">Last login</th>
                <th class="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in filteredUsers" :key="u.id" class="border-b pc-hairline last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                <td class="px-5 py-3">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="grid place-items-center w-7 h-7 rounded-full bg-primary-500/10 text-primary-500 text-xs font-semibold shrink-0">
                      {{ (u.name || u.email).slice(0, 1).toUpperCase() }}
                    </span>
                    <div class="min-w-0">
                      <div class="font-medium truncate flex items-center gap-1.5">
                        {{ u.name || u.email }}
                        <UBadge v-if="u.role === 'admin'" color="warning" variant="soft" size="sm">admin</UBadge>
                      </div>
                      <div class="text-xs pc-dim truncate">{{ u.email }}</div>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <UBadge :color="(planColor[u.plan] as any) || 'neutral'" variant="soft" size="sm" class="capitalize">{{ u.plan }}</UBadge>
                  <div v-if="u.planStatus && u.planStatus !== 'active'" class="text-[11px] pc-dim capitalize mt-0.5">{{ u.planStatus }}</div>
                </td>
                <td class="px-4 py-3 tabular-nums">{{ u.projects }} <span class="pc-dim text-xs">/ {{ u.projectLimit === 100000 ? '∞' : u.projectLimit }}</span></td>
                <td class="px-4 py-3 tabular-nums">{{ u.aiMessagesThisMonth }} <span class="pc-dim text-xs">/ {{ u.aiMessageLimit }}</span></td>
                <td class="px-4 py-3 tabular-nums">{{ u.aiTokensThisMonth.toLocaleString() }}</td>
                <td class="px-4 py-3 pc-dim">{{ fmtDate(u.lastLoginAt) }}</td>
                <td class="px-4 py-3 pc-dim">{{ fmtDate(u.createdAt) }}</td>
              </tr>
              <tr v-if="!filteredUsers.length">
                <td colspan="7" class="px-5 py-10 text-center pc-dim">No users match your search.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
