<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Sign in — Postcard' })

const { login } = useAuth()
const route = useRoute()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await login(email.value, password.value)
    await navigateTo((route.query.redirect as string) || '/app')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not sign in.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md px-5 py-20">
    <div class="pc-window pc-rise">
      <div class="pc-titlebar pc-material">
        <TrafficLights />
        <div class="flex-1 text-center text-[13px] pc-dim">Sign in</div>
      </div>
      <form class="p-8 space-y-4" @submit.prevent="submit">
        <div class="text-center mb-2">
          <h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p class="text-sm pc-dim mt-1">Sign in to your Postcard studio.</p>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-triangle-alert" />

        <UFormField label="Email">
          <UInput v-model="email" type="email" placeholder="you@example.com" autocomplete="email" size="lg" class="w-full" required />
        </UFormField>
        <UFormField label="Password">
          <UInput v-model="password" type="password" placeholder="••••••••" autocomplete="current-password" size="lg" class="w-full" required />
        </UFormField>

        <UButton type="submit" block size="lg" color="primary" :loading="loading">Sign in</UButton>

        <p class="text-center text-sm pc-dim">
          New here?
          <NuxtLink to="/signup" class="text-primary-500 hover:underline">Create an account</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
