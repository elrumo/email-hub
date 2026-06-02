<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Emails — Postcard' })

interface ProjectSummary {
  id: string
  name: string
  subject: string
  variables: { key: string }[]
  updatedAt: number
  createdAt: number
}

const { data, refresh, pending } = await useFetch<{ projects: ProjectSummary[] }>('/api/projects')
const toast = useToast()

function when(ts: number) {
  const d = Math.round((Date.now() - ts) / 1000)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

async function duplicate(id: string) {
  await $fetch(`/api/projects/${id}/duplicate`, { method: 'POST' })
  await refresh()
  toast.add({ title: 'Duplicated', icon: 'i-lucide-copy' })
}

async function remove(id: string) {
  await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
  await refresh()
  toast.add({ title: 'Deleted', icon: 'i-lucide-trash-2' })
}
</script>

<template>
  <div class="p-8 max-w-5xl mx-auto">
    <div class="flex items-end justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Your emails</h1>
        <p class="pc-dim text-sm mt-1">Design, personalize, and ship.</p>
      </div>
      <UButton to="/app/new" color="primary" icon="i-lucide-plus">New email</UButton>
    </div>

    <div v-if="pending" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="pc-card h-44 animate-pulse" />
    </div>

    <div v-else-if="!data?.projects.length" class="pc-card p-16 text-center">
      <div class="grid place-items-center w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-500 mx-auto mb-4">
        <UIcon name="i-lucide-mail-plus" class="w-7 h-7" />
      </div>
      <h3 class="font-semibold text-lg">No emails yet</h3>
      <p class="pc-dim text-sm mt-1 max-w-sm mx-auto">Start from a template or a blank canvas, then let Postcard AI do the heavy lifting.</p>
      <UButton to="/app/new" color="primary" class="mt-5" icon="i-lucide-plus">Create your first email</UButton>
    </div>

    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="p in data.projects"
        :key="p.id"
        class="pc-card overflow-hidden group hover:-translate-y-0.5 hover:shadow-md transition pc-rise"
      >
        <NuxtLink :to="`/app/projects/${p.id}`" class="block">
          <div class="h-28 bg-gradient-to-br from-primary-500/15 to-purple-500/15 grid place-items-center">
            <UIcon name="i-lucide-mail" class="w-8 h-8 text-primary-500/70" />
          </div>
          <div class="p-4">
            <div class="font-medium truncate">{{ p.name }}</div>
            <div class="text-xs pc-dim truncate mt-0.5">{{ p.subject || 'No subject' }}</div>
            <div class="flex items-center gap-3 mt-3 text-[11px] pc-dim">
              <span class="flex items-center gap-1"><UIcon name="i-lucide-clock" class="w-3 h-3" /> {{ when(p.updatedAt) }}</span>
              <span v-if="p.variables.length" class="flex items-center gap-1"><UIcon name="i-lucide-braces" class="w-3 h-3" /> {{ p.variables.length }} vars</span>
            </div>
          </div>
        </NuxtLink>
        <div class="flex border-t pc-hairline opacity-0 group-hover:opacity-100 transition">
          <UButton :to="`/app/projects/${p.id}`" variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none" icon="i-lucide-pencil">Edit</UButton>
          <UButton variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-copy" @click="duplicate(p.id)">Copy</UButton>
          <UButton variant="ghost" color="error" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-trash-2" @click="remove(p.id)">Delete</UButton>
        </div>
      </div>
    </div>
  </div>
</template>
