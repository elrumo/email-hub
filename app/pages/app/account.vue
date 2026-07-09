<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Account — Postcard' })

const { user } = useAuth()
const selfHosted = useRuntimeConfig().public.selfHosted

interface Usage {
  plan: { id: string, name: string, status: string | null }
  ai: { used: number, limit: number, remaining: number, totalTokens: number }
  projects: { used: number, limit: number }
  apiKeys: { used: number, limit: number }
}
const { data } = await useFetch<Usage>('/api/account/usage')
const busy = ref(false)
const error = ref('')

/** Render a plan cap, showing ∞ for the effectively-unlimited sentinels. */
function cap(limit: number | undefined) {
  if (limit == null || limit >= 100000) return '∞'
  return limit
}

async function manageBilling() {
  error.value = ''
  busy.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/billing/portal', { method: 'POST' })
    if (url) window.location.href = url
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Billing portal is unavailable.'
  } finally {
    busy.value = false
  }
}

function pct(used: number, limit: number) {
  if (!limit) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}
</script>

<template>
  <div class="p-8 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Account</h1>
      <p class="pc-dim text-sm mt-1">{{ user?.email }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <!-- Plan -->
    <div class="pc-card p-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs pc-dim uppercase tracking-wide">Current plan</div>
          <div class="text-xl font-semibold capitalize mt-0.5">{{ data?.plan.name }}</div>
          <div v-if="data?.plan.status" class="text-xs pc-dim mt-0.5 capitalize">Status: {{ data.plan.status }}</div>
        </div>
        <div v-if="!selfHosted" class="flex gap-2">
          <UButton to="/pricing" color="primary" variant="subtle">Change plan</UButton>
          <UButton v-if="data?.plan.id !== 'free'" color="neutral" variant="ghost" :loading="busy" @click="manageBilling">Manage billing</UButton>
        </div>
      </div>
    </div>

    <!-- Usage -->
    <div class="pc-card p-6 space-y-5">
      <div class="text-xs pc-dim uppercase tracking-wide">This month</div>

      <div>
        <div class="flex items-center justify-between text-sm mb-1.5">
          <span class="flex items-center gap-1.5"><UIcon name="i-lucide-sparkles" class="w-4 h-4 text-primary-500" /> AI assistant messages</span>
          <span class="pc-dim">{{ data?.ai.used }} / {{ cap(data?.ai.limit) }}</span>
        </div>
        <div class="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <div class="h-full bg-primary-500 rounded-full transition-all" :style="{ width: `${pct(data?.ai.used ?? 0, data?.ai.limit ?? 1)}%` }" />
        </div>
        <div class="text-[11px] pc-dim mt-1">{{ data?.ai.totalTokens.toLocaleString() }} tokens used</div>
      </div>

      <div>
        <div class="flex items-center justify-between text-sm mb-1.5">
          <span class="flex items-center gap-1.5"><UIcon name="i-lucide-layout-grid" class="w-4 h-4 text-purple-500" /> Email projects</span>
          <span class="pc-dim">{{ data?.projects.used }} / {{ cap(data?.projects.limit) }}</span>
        </div>
        <div class="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <div class="h-full bg-purple-500 rounded-full transition-all" :style="{ width: `${pct(data?.projects.used ?? 0, data?.projects.limit ?? 1)}%` }" />
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between text-sm mb-1.5">
          <span class="flex items-center gap-1.5"><UIcon name="i-lucide-key-round" class="w-4 h-4 text-green-500" /> API keys</span>
          <span class="pc-dim">{{ data?.apiKeys.used }} / {{ cap(data?.apiKeys.limit) }}</span>
        </div>
        <div class="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <div class="h-full bg-green-500 rounded-full transition-all" :style="{ width: `${pct(data?.apiKeys.used ?? 0, data?.apiKeys.limit ?? 1)}%` }" />
        </div>
      </div>
    </div>
  </div>
</template>
