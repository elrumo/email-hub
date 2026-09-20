<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Reset password — Postcard' })

const { forgotPassword } = useAuth()
const email = ref('')
const error = ref('')
const sent = ref(false)
const message = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const res = await forgotPassword(email.value)
    message.value = res.message
    sent.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not send the reset email.'
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
        <div class="flex-1 text-center text-[13px] pc-dim">Reset password</div>
      </div>
      <form class="p-8 space-y-4" @submit.prevent="submit">
        <div class="text-center mb-2">
          <h1 class="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
          <p class="text-sm pc-dim mt-1">Enter your email and we’ll send you a reset link.</p>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-triangle-alert" />

        <template v-if="sent">
          <UAlert color="success" variant="soft" :title="message" icon="i-lucide-mail-check" />
        </template>
        <template v-else>
          <UFormField label="Email">
            <UInput v-model="email" type="email" placeholder="you@example.com" autocomplete="email" size="lg" class="w-full" required />
          </UFormField>
          <UButton type="submit" block size="lg" color="primary" :loading="loading">Send reset link</UButton>
        </template>

        <p class="text-center text-sm pc-dim">
          Remembered it?
          <NuxtLink to="/login" class="text-primary-500 hover:underline">Back to sign in</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
