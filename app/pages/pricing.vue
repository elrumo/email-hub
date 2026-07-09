<script setup lang="ts">
import type { Plan } from '~~/server/utils/plans'

definePageMeta({ layout: 'default' })
useHead({ title: 'Pricing — Postcard' })

// Self-hosted instances are unlimited and never bill — there's nothing to price.
if (useRuntimeConfig().public.selfHosted) {
  await navigateTo('/app')
}

const { user, loaded, fetchUser } = useAuth()
if (!loaded.value) await fetchUser()

const { data } = await useFetch<{ billingConfigured: boolean, plans: Plan[] }>('/api/plans')
const busy = ref<string | null>(null)
const error = ref('')

async function choose(plan: Plan) {
  error.value = ''
  if (!user.value) return navigateTo(`/signup?redirect=/pricing`)
  if (plan.id === 'free') return navigateTo('/app')
  busy.value = plan.id
  try {
    const { url } = await $fetch<{ url: string }>('/api/billing/checkout', { method: 'POST', body: { plan: plan.id } })
    if (url) window.location.href = url
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not start checkout.'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-16">
    <div class="text-center">
      <h1 class="text-4xl font-semibold tracking-tight">Simple, honest pricing</h1>
      <p class="pc-dim mt-3">Start free. Upgrade when your email program grows.</p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" class="mt-6 max-w-md mx-auto" :title="error" />
    <UAlert
      v-if="data && !data.billingConfigured"
      color="warning"
      variant="soft"
      class="mt-6 max-w-2xl mx-auto"
      icon="i-lucide-info"
      title="Billing isn't configured on this instance"
      description="Set your Stripe keys and price IDs in the environment to enable paid checkout."
    />

    <div class="mt-12 grid md:grid-cols-3 gap-5 items-start">
      <div
        v-for="(plan, i) in data?.plans"
        :key="plan.id"
        class="pc-window p-7 flex flex-col"
        :class="[plan.id === 'starter' ? 'ring-2 ring-primary-500' : '', `pc-rise${i === 1 ? '-2' : i === 2 ? '-3' : ''}`]"
      >
        <div v-if="plan.id === 'starter'" class="self-start mb-3 text-xs font-medium text-primary-500 bg-primary-500/10 rounded-full px-2.5 py-1">
          Most popular
        </div>
        <h3 class="text-lg font-semibold">{{ plan.name }}</h3>
        <p class="text-sm pc-dim mt-1 min-h-[40px]">{{ plan.tagline }}</p>
        <div class="mt-4 flex items-baseline gap-1">
          <span class="text-4xl font-semibold tracking-tight">${{ plan.price }}</span>
          <span class="pc-dim text-sm">/ month</span>
        </div>

        <ul class="mt-6 space-y-2.5 flex-1">
          <li v-for="feat in plan.features" :key="feat" class="flex items-start gap-2 text-sm">
            <UIcon name="i-lucide-check" class="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
            <span>{{ feat }}</span>
          </li>
        </ul>

        <UButton
          class="mt-7 justify-center"
          block
          size="lg"
          :color="plan.id === 'starter' ? 'primary' : 'neutral'"
          :variant="plan.id === 'starter' ? 'solid' : 'subtle'"
          :loading="busy === plan.id"
          :disabled="!!user && user.plan === plan.id"
          @click="choose(plan)"
        >
          {{ user && user.plan === plan.id ? 'Current plan' : plan.price === 0 ? 'Get started' : 'Subscribe' }}
        </UButton>
      </div>
    </div>
  </div>
</template>
