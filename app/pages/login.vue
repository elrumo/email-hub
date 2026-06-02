<script setup lang="ts">
const auth = useAuth()
const toast = useToast()
const router = useRouter()

const mode = ref<'login' | 'signup'>('login')
const username = ref('')
const password = ref('')
const email = ref('')
const pending = ref(false)

async function submit() {
  if (!username.value || !password.value) return
  pending.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(username.value, password.value)
    } else {
      await auth.signup(username.value, password.value, email.value || undefined)
    }
    await router.replace('/home')
  } catch (e) {
    const msg = (e as { data?: { statusMessage?: string }, statusMessage?: string })?.data?.statusMessage
      ?? (e as { statusMessage?: string })?.statusMessage
      ?? 'Something went wrong'
    toast.add({ title: msg, color: 'error' })
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center px-4">
    <UCard class="w-full max-w-sm animate-rise">
      <div class="mb-6 flex flex-col items-center gap-2 text-center">
        <span class="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <UIcon
            name="i-lucide-stethoscope"
            class="size-5"
          />
        </span>
        <h1 class="text-lg font-semibold tracking-tight text-highlighted">
          {{ mode === 'login' ? 'Sign in' : 'Create your account' }}
        </h1>
        <p class="text-sm text-muted">
          {{ mode === 'login' ? 'Welcome back to Flow Hub.' : 'Set a username and password to get started.' }}
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
            placeholder="yourname"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="mode === 'signup'"
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
          :description="mode === 'signup' ? 'At least 8 characters.' : undefined"
        >
          <UInput
            v-model="password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            placeholder="••••••••"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="pending"
          :label="mode === 'login' ? 'Sign in' : 'Create account'"
        />
      </form>

      <template #footer>
        <p class="text-center text-sm text-muted">
          <template v-if="mode === 'login'">
            No account?
            <UButton
              variant="link"
              :padded="false"
              label="Sign up"
              @click="mode = 'signup'"
            />
          </template>
          <template v-else>
            Already have an account?
            <UButton
              variant="link"
              :padded="false"
              label="Sign in"
              @click="mode = 'login'"
            />
          </template>
        </p>
      </template>
    </UCard>
  </div>
</template>
