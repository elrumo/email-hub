<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'API & keys — Postcard' })

interface KeyRow {
  id: string
  name: string
  prefix: string
  lastUsedAt: number | null
  revokedAt: number | null
  createdAt: number
}

const { data, refresh } = await useFetch<{ keys: KeyRow[] }>('/api/keys')
const toast = useToast()

const newName = ref('')
const creating = ref(false)
const error = ref('')
const revealed = ref<string | null>(null)

async function create() {
  error.value = ''
  creating.value = true
  try {
    const res = await $fetch<{ secret: string }>('/api/keys', { method: 'POST', body: { name: newName.value } })
    revealed.value = res.secret
    newName.value = ''
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not create the key.'
  } finally {
    creating.value = false
  }
}

async function revoke(id: string) {
  await $fetch(`/api/keys/${id}`, { method: 'DELETE' })
  await refresh()
  toast.add({ title: 'Key revoked', icon: 'i-lucide-shield-off' })
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
  toast.add({ title: 'Copied to clipboard', icon: 'i-lucide-check' })
}

const active = computed(() => data.value?.keys.filter(k => !k.revokedAt) ?? [])
</script>

<template>
  <div class="p-8 max-w-3xl mx-auto space-y-6">
    <div class="flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">API & keys</h1>
        <p class="pc-dim text-sm mt-1">Fetch your rendered email HTML programmatically.</p>
      </div>
      <UButton to="/docs/api" color="neutral" variant="subtle" icon="i-lucide-book-open">API docs</UButton>
    </div>

    <!-- Reveal banner -->
    <UAlert v-if="revealed" color="success" variant="soft" icon="i-lucide-key-round" title="Your new API key">
      <template #description>
        <p class="text-sm mb-2">Copy it now — you won't be able to see it again.</p>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-xs bg-black/5 dark:bg-white/10 rounded-lg px-3 py-2 font-mono break-all">{{ revealed }}</code>
          <UButton size="sm" color="neutral" icon="i-lucide-copy" @click="copy(revealed!)">Copy</UButton>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="revealed = null" />
        </div>
      </template>
    </UAlert>

    <!-- Create -->
    <div class="pc-card p-5">
      <UAlert v-if="error" color="error" variant="soft" class="mb-3" :title="error" />
      <div class="flex items-end gap-2">
        <UFormField label="New key name" class="flex-1">
          <UInput v-model="newName" placeholder="Production server" size="lg" class="w-full" @keyup.enter="create" />
        </UFormField>
        <UButton size="lg" color="primary" icon="i-lucide-plus" :loading="creating" @click="create">Create key</UButton>
      </div>
    </div>

    <!-- List -->
    <div class="pc-card divide-y pc-hairline">
      <div v-if="!active.length" class="p-8 text-center pc-dim text-sm">No active API keys yet.</div>
      <div v-for="k in active" :key="k.id" class="p-4 flex items-center gap-3">
        <div class="grid place-items-center w-9 h-9 rounded-lg bg-green-500/10 text-green-500">
          <UIcon name="i-lucide-key-round" class="w-4 h-4" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-medium text-sm truncate">{{ k.name }}</div>
          <div class="text-xs pc-dim font-mono">{{ k.prefix }}••••••</div>
        </div>
        <div class="text-xs pc-dim hidden sm:block">
          {{ k.lastUsedAt ? 'Used' : 'Never used' }}
        </div>
        <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" @click="revoke(k.id)">Revoke</UButton>
      </div>
    </div>

    <!-- Quick start -->
    <div class="pc-card p-5">
      <div class="text-sm font-medium mb-2">Quick start</div>
      <pre class="text-xs bg-black/5 dark:bg-white/10 rounded-lg p-4 overflow-auto pc-scroll"><code>curl -H "Authorization: Bearer pc_live_…" \
  {{ '\$' }}APP_URL/api/v1/projects

# Render one project's HTML with variables
curl -H "Authorization: Bearer pc_live_…" \
  "{{ '\$' }}APP_URL/api/v1/projects/PROJECT_ID/html?firstName=Ada&format=html"</code></pre>
    </div>
  </div>
</template>
