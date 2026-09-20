<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Choose a new password — Postcard' })

const { resetPassword } = useAuth()
const route = useRoute()
const token = (route.query.token as string) || ''
const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = 'Passwords don’t match.'
    return
  }
  loading.value = true
  try {
    await resetPassword(token, password.value)
    await navigateTo('/app')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not reset your password.'
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
        <div class="flex-1 text-center text-[13px] pc-dim">Choose a new password</div>
      </div>
      <form class="p-8 space-y-4" @submit.prevent="submit">
        <div class="text-center mb-2">
          <h1 class="text-2xl font-semibold tracking-tight">Set a new password</h1>
          <p class="text-sm pc-dim mt-1">Pick a strong password you don’t use elsewhere.</p>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-triangle-alert" />

        <template v-if="!token">
          <UAlert color="warning" variant="soft" title="This reset link is missing its token. Request a new one." icon="i-lucide-triangle-alert" />
          <NuxtLink to="/forgot-password" class="block text-center text-sm text-primary-500 hover:underline">Request a new link</NuxtLink>
        </template>
        <template v-else>
          <UFormField label="New password" hint="At least 8 characters">
            <UInput v-model="password" type="password" placeholder="••••••••" autocomplete="new-password" size="lg" class="w-full" required />
          </UFormField>
          <UFormField label="Confirm password">
            <UInput v-model="confirm" type="password" placeholder="••••••••" autocomplete="new-password" size="lg" class="w-full" required />
          </UFormField>
          <UButton type="submit" block size="lg" color="primary" :loading="loading">Reset password</UButton>
        </template>

        <p class="text-center text-sm pc-dim">
          <NuxtLink to="/login" class="text-primary-500 hover:underline">Back to sign in</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
