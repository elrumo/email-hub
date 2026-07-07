<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Create account — Postcard' })

const { signup } = useAuth()
const route = useRoute()
const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await signup(email.value, password.value, name.value)
    await navigateTo((route.query.redirect as string) || '/app')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not create your account.'
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
        <div class="flex-1 text-center text-[13px] pc-dim">Create account</div>
      </div>
      <form class="p-8 space-y-4" @submit.prevent="submit">
        <div class="text-center mb-2">
          <h1 class="text-2xl font-semibold tracking-tight">Create your studio</h1>
          <p class="text-sm pc-dim mt-1">Start designing email in seconds. No card required.</p>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-triangle-alert" />

        <UFormField label="Name">
          <UInput v-model="name" placeholder="Ada Lovelace" autocomplete="name" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="Email">
          <UInput v-model="email" type="email" placeholder="you@example.com" autocomplete="email" size="lg" class="w-full" required />
        </UFormField>
        <UFormField label="Password" hint="At least 8 characters">
          <UInput v-model="password" type="password" placeholder="••••••••" autocomplete="new-password" size="lg" class="w-full" required />
        </UFormField>

        <UButton type="submit" block size="lg" color="primary" :loading="loading">Create account</UButton>

        <p class="text-center text-sm pc-dim">
          Already have an account?
          <NuxtLink to="/login" class="text-primary-500 hover:underline">Sign in</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
