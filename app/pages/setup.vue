<script setup lang="ts">
const auth = useAuth()
const toast = useToast()
const router = useRouter()

const username = ref('')
const password = ref('')
const email = ref('')
const pending = ref(false)

async function submit() {
  if (!username.value || password.value.length < 8) return
  pending.value = true
  try {
    await auth.setup(username.value, password.value, email.value || undefined)
    toast.add({ title: 'Admin account created', color: 'success' })
    await router.replace('/home')
  } catch (e) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Setup failed'
    toast.add({ title: msg, color: 'error' })
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center px-4">
    <UCard class="w-full max-w-sm">
      <div class="mb-6 flex flex-col items-center gap-2 text-center">
        <span class="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <UIcon
            name="i-lucide-shield-check"
            class="size-5"
          />
        </span>
        <h1 class="text-lg font-semibold tracking-tight text-highlighted">
          Welcome — create your admin account
        </h1>
        <p class="text-sm text-muted">
          This first account is the administrator and adopts any existing flows, connections and monitors.
        </p>
      </div>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <UFormField
          label="Username"
          required
        >
          <UInput
            v-model="username"
            autocomplete="username"
            placeholder="admin"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Email"
          description="Optional."
        >
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Password"
          required
          description="At least 8 characters."
        >
          <UInput
            v-model="password"
            type="password"
            autocomplete="new-password"
            placeholder="••••••••"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="pending"
          label="Create admin account"
        />
      </form>
    </UCard>
  </div>
</template>
