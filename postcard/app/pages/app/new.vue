<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'New email — Postcard' })

interface TemplateMeta {
  id: string
  name: string
  type: string
  style: string
  icon: string
  accent: string
  description: string
}

const { data } = await useFetch<{ templates: TemplateMeta[] }>('/api/templates')
const creating = ref<string | null>(null)
const error = ref('')

async function create(templateId?: string) {
  error.value = ''
  creating.value = templateId || 'blank'
  try {
    const { project } = await $fetch<{ project: { id: string } }>('/api/projects', {
      method: 'POST',
      body: { templateId }
    })
    await navigateTo(`/app/projects/${project.id}`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not create the project.'
    creating.value = null
  }
}
</script>

<template>
  <div class="p-8 max-w-5xl mx-auto">
    <div class="flex items-center gap-2 mb-6">
      <UButton to="/app" color="neutral" variant="ghost" size="sm" icon="i-lucide-arrow-left" />
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Start a new email</h1>
        <p class="pc-dim text-sm">Pick a template or begin from scratch.</p>
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="soft" class="mb-5" :title="error" />

    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Blank -->
      <button
        class="pc-card p-6 text-left hover:-translate-y-0.5 hover:shadow-md transition flex flex-col items-start"
        :disabled="!!creating"
        @click="create()"
      >
        <div class="grid place-items-center w-11 h-11 rounded-xl bg-zinc-500/10 text-zinc-500 mb-4">
          <UIcon :name="creating === 'blank' ? 'i-lucide-loader-circle' : 'i-lucide-file'" class="w-5 h-5" :class="creating === 'blank' && 'animate-spin'" />
        </div>
        <div class="font-medium">Blank canvas</div>
        <p class="text-sm pc-dim mt-1">A clean slate. Build it your way or ask the AI.</p>
      </button>

      <button
        v-for="t in data?.templates"
        :key="t.id"
        class="pc-card p-6 text-left hover:-translate-y-0.5 hover:shadow-md transition flex flex-col items-start"
        :disabled="!!creating"
        @click="create(t.id)"
      >
        <div class="grid place-items-center w-11 h-11 rounded-xl mb-4" :style="{ backgroundColor: `${t.accent}1a`, color: t.accent }">
          <UIcon :name="creating === t.id ? 'i-lucide-loader-circle' : t.icon" class="w-5 h-5" :class="creating === t.id && 'animate-spin'" />
        </div>
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ t.name }}</span>
          <UBadge color="neutral" variant="soft" size="sm">{{ t.style }}</UBadge>
        </div>
        <p class="text-sm pc-dim mt-1">{{ t.description }}</p>
      </button>
    </div>
  </div>
</template>
