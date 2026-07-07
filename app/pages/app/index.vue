<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Projects — Postcard' })

interface ProjectRow {
  id: string
  name: string
  emails: number
  updatedAt: number
  createdAt: number
}

const { data, refresh, pending } = await useFetch<{ projects: ProjectRow[] }>('/api/projects')
const toast = useToast()

const creating = ref(false)
const newName = ref('')
const busy = ref(false)

const renaming = ref<ProjectRow | null>(null)
const renameName = ref('')

function when(ts: number) {
  const d = Math.round((Date.now() - ts) / 1000)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

async function createProject() {
  if (!newName.value.trim()) return
  busy.value = true
  try {
    const { project } = await $fetch<{ project: ProjectRow }>('/api/projects', {
      method: 'POST',
      body: { name: newName.value }
    })
    creating.value = false
    newName.value = ''
    await navigateTo(`/app/projects/${project.id}`)
  } catch (e: any) {
    toast.add({ title: e?.data?.statusMessage || 'Could not create the project.', color: 'error' })
  } finally {
    busy.value = false
  }
}

function startRename(p: ProjectRow) {
  renaming.value = p
  renameName.value = p.name
}

async function saveRename() {
  if (!renaming.value || !renameName.value.trim()) return
  busy.value = true
  try {
    await $fetch(`/api/projects/${renaming.value.id}`, { method: 'PUT', body: { name: renameName.value } })
    renaming.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: e?.data?.statusMessage || 'Rename failed.', color: 'error' })
  } finally {
    busy.value = false
  }
}

async function remove(p: ProjectRow) {
  if (!confirm(`Delete "${p.name}" and all ${p.emails} email(s) inside it? This cannot be undone.`)) return
  await $fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
  await refresh()
  toast.add({ title: 'Project deleted', icon: 'i-lucide-trash-2' })
}
</script>

<template>
  <div class="p-8 max-w-5xl mx-auto">
    <div class="flex items-end justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
        <p class="pc-dim text-sm mt-1">Organise your emails into projects and folders.</p>
      </div>
      <UButton color="primary" icon="i-lucide-plus" @click="creating = true">New project</UButton>
    </div>

    <!-- Create -->
    <div v-if="creating" class="pc-card p-4 mb-5 flex items-center gap-3">
      <UInput v-model="newName" placeholder="Project name…" class="flex-1" autofocus @keyup.enter="createProject" />
      <UButton color="primary" :loading="busy" @click="createProject">Create</UButton>
      <UButton color="neutral" variant="ghost" @click="creating = false">Cancel</UButton>
    </div>

    <div v-if="pending" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="pc-card h-36 animate-pulse" />
    </div>

    <div v-else-if="!data?.projects.length" class="pc-card p-16 text-center">
      <div class="grid place-items-center w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-500 mx-auto mb-4">
        <UIcon name="i-lucide-folder-plus" class="w-7 h-7" />
      </div>
      <h3 class="font-semibold text-lg">No projects yet</h3>
      <p class="pc-dim text-sm mt-1 max-w-sm mx-auto">Create a project to hold your emails — add folders inside to keep campaigns tidy.</p>
      <UButton color="primary" class="mt-5" icon="i-lucide-plus" @click="creating = true">Create your first project</UButton>
    </div>

    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="p in data.projects"
        :key="p.id"
        class="pc-card overflow-hidden group hover:-translate-y-0.5 hover:shadow-md transition pc-rise"
      >
        <NuxtLink :to="`/app/projects/${p.id}`" class="block p-5">
          <div class="grid place-items-center w-11 h-11 rounded-xl bg-primary-500/10 text-primary-500 mb-4">
            <UIcon name="i-lucide-folder" class="w-5 h-5" />
          </div>
          <div class="font-medium truncate">{{ p.name }}</div>
          <div class="flex items-center gap-3 mt-2 text-[11px] pc-dim">
            <span class="flex items-center gap-1"><UIcon name="i-lucide-mail" class="w-3 h-3" /> {{ p.emails }} email{{ p.emails === 1 ? '' : 's' }}</span>
            <span class="flex items-center gap-1"><UIcon name="i-lucide-clock" class="w-3 h-3" /> {{ when(p.updatedAt) }}</span>
          </div>
        </NuxtLink>
        <div class="flex border-t pc-hairline opacity-0 group-hover:opacity-100 transition">
          <UButton :to="`/app/projects/${p.id}`" variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none" icon="i-lucide-folder-open">Open</UButton>
          <UButton variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-pencil" @click="startRename(p)">Rename</UButton>
          <UButton variant="ghost" color="error" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-trash-2" @click="remove(p)">Delete</UButton>
        </div>
      </div>
    </div>

    <!-- Rename -->
    <div v-if="renaming" class="fixed inset-0 z-50 grid place-items-center bg-black/30" @click.self="renaming = null">
      <div class="pc-card p-5 w-[380px] space-y-3">
        <div class="font-medium">Rename project</div>
        <UInput v-model="renameName" class="w-full" autofocus @keyup.enter="saveRename" />
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="renaming = null">Cancel</UButton>
          <UButton color="primary" :loading="busy" @click="saveRename">Save</UButton>
        </div>
      </div>
    </div>
  </div>
</template>
