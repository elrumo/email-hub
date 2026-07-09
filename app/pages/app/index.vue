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
const search = ref('')

const renaming = ref<ProjectRow | null>(null)
const renameName = ref('')

const filteredProjects = computed(() => {
  if (!search.value.trim()) return data.value?.projects ?? []
  const q = search.value.toLowerCase()
  return (data.value?.projects ?? []).filter(p => p.name.toLowerCase().includes(q))
})

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
  <div class="projects-page">
    <!-- Header -->
    <div class="projects-header pc-rise">
      <h1 class="projects-title">Projects</h1>
      <div class="projects-header-actions">
        <div class="projects-search">
          <UIcon name="i-lucide-search" class="projects-search-icon" />
          <input
            v-model="search"
            type="text"
            class="projects-search-input"
            placeholder="Search projects..."
          />
        </div>
        <button class="projects-new-btn" @click="creating = true">
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          Project
        </button>
      </div>
    </div>

    <!-- Create inline form -->
    <div v-if="creating" class="projects-create pc-rise-2">
      <input
        v-model="newName"
        class="projects-create-input"
        placeholder="Project name..."
        autofocus
        @keyup.enter="createProject"
      />
      <button class="projects-create-btn" :disabled="busy || !newName.trim()" @click="createProject">
        {{ busy ? 'Creating...' : 'Create' }}
      </button>
      <button class="projects-create-cancel" @click="creating = false">Cancel</button>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="projects-grid">
      <div v-for="i in 6" :key="i" class="project-card project-card--skeleton">
        <div class="project-card-thumb project-card-thumb--skeleton" />
        <div class="project-card-info">
          <div class="skeleton-line skeleton-line--title" />
          <div class="skeleton-line skeleton-line--sub" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!filteredProjects.length && !search" class="projects-empty pc-rise-2">
      <div class="projects-empty-icon">
        <UIcon name="i-lucide-folder-plus" class="w-8 h-8" />
      </div>
      <h3 class="projects-empty-title">No projects yet</h3>
      <p class="projects-empty-desc">Create a project to organize your email campaigns.</p>
      <button class="projects-empty-btn" @click="creating = true">
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        Create your first project
      </button>
    </div>

    <!-- No search results -->
    <div v-else-if="!filteredProjects.length && search" class="projects-empty pc-rise-2">
      <div class="projects-empty-icon">
        <UIcon name="i-lucide-search-x" class="w-8 h-8" />
      </div>
      <h3 class="projects-empty-title">No results</h3>
      <p class="projects-empty-desc">No projects match "{{ search }}".</p>
    </div>

    <!-- Projects grid -->
    <div v-else class="projects-grid">
      <div
        v-for="(p, i) in filteredProjects"
        :key="p.id"
        class="project-card pc-rise"
        :style="{ animationDelay: `${i * 0.04}s` }"
      >
        <NuxtLink :to="`/app/projects/${p.id}`" class="project-card-link">
          <div class="project-card-thumb">
            <div class="project-card-thumb-icon">
              <svg viewBox="0 0 20 20" fill="none" class="w-6 h-6">
                <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.2" />
                <path d="M2 7l8 5 8-5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
              </svg>
            </div>
          </div>
          <div class="project-card-info">
            <div class="project-card-name">{{ p.name }}</div>
            <div class="project-card-meta">
              <span class="project-card-meta-item">
                <UIcon name="i-lucide-mail" class="w-3 h-3" />
                {{ p.emails }} email{{ p.emails === 1 ? '' : 's' }}
              </span>
              <span class="project-card-dot">·</span>
              <span class="project-card-meta-item">{{ when(p.updatedAt) }}</span>
            </div>
          </div>
        </NuxtLink>
        <div class="project-card-actions">
          <button class="project-card-action" @click.stop="startRename(p)">
            <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" />
          </button>
          <button class="project-card-action project-card-action--danger" @click.stop="remove(p)">
            <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Rename modal -->
    <div v-if="renaming" class="modal-overlay" @click.self="renaming = null">
      <div class="modal-card">
        <div class="modal-title">Rename project</div>
        <input
          v-model="renameName"
          class="modal-input"
          autofocus
          @keyup.enter="saveRename"
        />
        <div class="modal-actions">
          <button class="modal-btn modal-btn--ghost" @click="renaming = null">Cancel</button>
          <button class="modal-btn modal-btn--primary" :disabled="busy || !renameName.trim()" @click="saveRename">
            {{ busy ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.projects-page {
  padding: 32px 40px;
  max-width: 1200px;
  margin: 0 auto;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.projects-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  gap: 16px;
}

.projects-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--pc-text);
  margin: 0;
  letter-spacing: -0.02em;
}

.projects-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.projects-search {
  position: relative;
  display: flex;
  align-items: center;
}

.projects-search-icon {
  position: absolute;
  left: 10px;
  width: 16px;
  height: 16px;
  color: var(--pc-text-muted);
  pointer-events: none;
}

.projects-search-input {
  width: 260px;
  padding: 7px 12px 7px 32px;
  border-radius: 8px;
  border: 1px solid var(--pc-border);
  background: var(--pc-window-solid);
  font-size: 13px;
  color: var(--pc-text);
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.projects-search-input::placeholder {
  color: var(--pc-text-muted);
}

.projects-search-input:focus {
  border-color: var(--pc-border-strong);
}

.projects-new-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text);
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  font-family: inherit;
  white-space: nowrap;
}

.projects-new-btn:hover {
  background: var(--pc-hover);
  border-color: var(--pc-border-strong);
}

/* ── Create form ───────────────────────────────────────────────────────── */
.projects-create {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  margin-bottom: 20px;
}

.projects-create-input {
  flex: 1;
  padding: 6px 0;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--pc-text);
  outline: none;
  font-family: inherit;
}

.projects-create-input::placeholder {
  color: var(--pc-text-muted);
}

.projects-create-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-bg);
  background: var(--pc-text);
  cursor: pointer;
  transition: opacity 0.15s;
  font-family: inherit;
  border: none;
  white-space: nowrap;
}

.projects-create-btn:hover {
  opacity: 0.85;
}

.projects-create-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.projects-create-cancel {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--pc-text-dim);
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.projects-create-cancel:hover {
  color: var(--pc-text);
}

/* ── Grid ──────────────────────────────────────────────────────────────── */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 14px;
}

@media (min-width: 640px) {
  .projects-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .projects-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ── Project card ──────────────────────────────────────────────────────── */
.project-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  transition: border-color 0.15s, box-shadow 0.2s;
}

.project-card:hover {
  border-color: var(--pc-border-strong);
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.1);
}

.dark .project-card:hover {
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
}

.project-card-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.project-card-thumb {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pc-surface);
  border-bottom: 1px solid var(--pc-border);
}

.project-card-thumb-icon {
  color: var(--pc-text-muted);
  opacity: 0.4;
}

.project-card-info {
  padding: 12px 14px;
}

.project-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--pc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-card-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--pc-text-dim);
}

.project-card-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-card-dot {
  color: var(--pc-text-muted);
}

/* Actions (hover reveal) */
.project-card-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.project-card:hover .project-card-actions {
  opacity: 1;
}

.project-card-action {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  color: var(--pc-text-dim);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.project-card-action:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

.project-card-action--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.2);
}

/* Skeleton */
.project-card--skeleton {
  pointer-events: none;
}

.project-card-thumb--skeleton {
  background: var(--pc-surface);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line {
  height: 12px;
  border-radius: 4px;
  background: var(--pc-surface);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line--title {
  width: 60%;
  margin-bottom: 6px;
}

.skeleton-line--sub {
  width: 40%;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Empty state ───────────────────────────────────────────────────────── */
.projects-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80px 20px;
}

.projects-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--pc-surface);
  color: var(--pc-text-muted);
  margin-bottom: 16px;
}

.projects-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--pc-text);
  margin: 0 0 6px;
}

.projects-empty-desc {
  font-size: 14px;
  color: var(--pc-text-dim);
  margin: 0 0 20px;
}

.projects-empty-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-bg);
  background: var(--pc-text);
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
}

.projects-empty-btn:hover {
  opacity: 0.85;
}

/* ── Modal ─────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.modal-card {
  width: 360px;
  max-width: calc(100vw - 2rem);
  padding: 20px;
  border-radius: 12px;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  box-shadow: var(--pc-shadow);
}

.modal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--pc-text);
  margin-bottom: 12px;
}

.modal-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--pc-border);
  background: var(--pc-bg);
  font-size: 14px;
  color: var(--pc-text);
  outline: none;
  font-family: inherit;
  margin-bottom: 16px;
  transition: border-color 0.15s;
}

.modal-input:focus {
  border-color: var(--pc-border-strong);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  border: none;
  transition: opacity 0.15s;
}

.modal-btn--ghost {
  color: var(--pc-text-dim);
  background: transparent;
}

.modal-btn--ghost:hover {
  color: var(--pc-text);
}

.modal-btn--primary {
  color: var(--pc-bg);
  background: var(--pc-text);
}

.modal-btn--primary:hover {
  opacity: 0.85;
}

.modal-btn--primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
