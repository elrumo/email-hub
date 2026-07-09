<script setup lang="ts">
import type { EmailDocument } from '#shared/email/blocks'
import { walkBlocks } from '#shared/email/blocks'

definePageMeta({ layout: 'app' })

interface FolderRow { id: string, name: string, parentId: string | null }
interface EmailRow {
  id: string
  name: string
  subject: string
  variables: { key: string }[]
  folderId: string | null
  updatedAt: number
}
interface ProjectDetail {
  access: 'owner' | 'member'
  project: { id: string, name: string }
  folders: FolderRow[]
  emails: EmailRow[]
}

const route = useRoute()
const toast = useToast()
const id = route.params.id as string

const { data, refresh, pending } = await useFetch<ProjectDetail>(`/api/projects/${id}`, { key: `project-browser-${id}` })
useHead({ title: () => `${data.value?.project.name ?? 'Project'} — Postcard` })

/** current folder from ?folder= (null = project root) */
const currentFolderId = computed(() => (route.query.folder as string) || null)
const currentFolder = computed(() => data.value?.folders.find(f => f.id === currentFolderId.value) ?? null)

const breadcrumbs = computed(() => {
  const trail: FolderRow[] = []
  let cursor = currentFolder.value
  while (cursor) {
    trail.unshift(cursor)
    cursor = data.value?.folders.find(f => f.id === cursor!.parentId) ?? null
  }
  return trail
})

const subfolders = computed(() =>
  (data.value?.folders ?? []).filter(f => f.parentId === currentFolderId.value)
)
const emailsHere = computed(() =>
  (data.value?.emails ?? []).filter(e => e.folderId === currentFolderId.value)
)

function folderLink(folderId: string | null) {
  return folderId ? { path: `/app/projects/${id}`, query: { folder: folderId } } : { path: `/app/projects/${id}` }
}

function when(ts: number) {
  const d = Math.round((Date.now() - ts) / 1000)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

const newEmailLink = computed(() => ({
  path: '/app/new',
  query: { projectId: id, ...(currentFolderId.value ? { folderId: currentFolderId.value } : {}) }
}))

// ---- folders ---------------------------------------------------------------
const creatingFolder = ref(false)
const folderName = ref('')
const busy = ref(false)

async function createFolder() {
  if (!folderName.value.trim()) return
  busy.value = true
  try {
    await $fetch('/api/folders', {
      method: 'POST',
      body: { projectId: id, parentId: currentFolderId.value, name: folderName.value }
    })
    creatingFolder.value = false
    folderName.value = ''
    await refresh()
  } catch (e: any) {
    toast.add({ title: e?.data?.statusMessage || 'Could not create the folder.', color: 'error' })
  } finally {
    busy.value = false
  }
}

async function renameFolder(f: FolderRow) {
  const name = prompt('Rename folder', f.name)
  if (!name?.trim() || name === f.name) return
  await $fetch(`/api/folders/${f.id}`, { method: 'PUT', body: { name } })
  await refresh()
}

async function removeFolder(f: FolderRow) {
  if (!confirm(`Delete the folder "${f.name}"? Its contents move up a level.`)) return
  await $fetch(`/api/folders/${f.id}`, { method: 'DELETE' })
  await refresh()
}

// ---- emails ----------------------------------------------------------------
async function duplicate(emailId: string) {
  await $fetch(`/api/emails/${emailId}/duplicate`, { method: 'POST' })
  await refresh()
  toast.add({ title: 'Duplicated', icon: 'i-lucide-copy' })
}

async function removeEmail(e: EmailRow) {
  if (!confirm(`Delete "${e.name}"? This cannot be undone.`)) return
  await $fetch(`/api/emails/${e.id}`, { method: 'DELETE' })
  await refresh()
  toast.add({ title: 'Deleted', icon: 'i-lucide-trash-2' })
}

// ---- import ----------------------------------------------------------------
const fileInput = ref<HTMLInputElement | null>(null)

function isValidEmailDocument(doc: unknown): doc is EmailDocument {
  if (!doc || typeof doc !== 'object') return false
  const d = doc as Record<string, unknown>
  if (!d.settings || typeof d.settings !== 'object') return false
  if (!Array.isArray(d.blocks)) return false
  return true
}

function assignBlockIds(blocks: EmailDocument['blocks']) {
  walkBlocks(blocks, (b) => {
    if (!b.id) (b as { id: string }).id = `blk_${Math.random().toString(36).slice(2, 9)}`
  })
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)

    let doc: EmailDocument
    let name: string

    if (isValidEmailDocument(parsed)) {
      doc = parsed
      name = file.name.replace(/\.json$/i, '') || 'Imported email'
    } else if (parsed.document && isValidEmailDocument(parsed.document)) {
      doc = parsed.document
      name = parsed.name || file.name.replace(/\.json$/i, '') || 'Imported email'
    } else {
      toast.add({ title: 'Invalid file — expected an email document (.json)', color: 'error' })
      return
    }

    assignBlockIds(doc.blocks)

    busy.value = true
    const res = await $fetch<{ project: { id: string } }>('/api/emails', {
      method: 'POST',
      body: { name, document: doc, projectId: id, folderId: currentFolderId.value }
    })
    await refresh()
    toast.add({ title: `Imported "${name}"`, icon: 'i-lucide-upload', color: 'success' })
    await navigateTo(`/app/emails/${res.project.id}`)
  } catch (err: any) {
    toast.add({ title: err?.data?.statusMessage || 'Import failed — check the file format.', color: 'error' })
  } finally {
    busy.value = false
  }
}

// ---- sharing & members -------------------------------------------------------
interface Member { id: string, email: string, name: string | null }
const shareOpen = ref(false)
const shareMode = ref<'off' | 'view' | 'edit'>('off')
const shareToken = ref<string | null>(null)
const members = ref<Member[]>([])
const memberEmail = ref('')
const shareBusy = ref(false)
const memberError = ref('')

const shareUrl = computed(() =>
  shareToken.value && import.meta.client ? `${window.location.origin}/share/${shareToken.value}` : null
)

const shareModes = [
  { value: 'off', label: 'Off — private', description: 'Only you and members can open this project.' },
  { value: 'view', label: 'Anyone with the link can view', description: 'A clean browser preview of every email inside.' },
  { value: 'edit', label: 'Link viewers can view · signed-in can edit', description: 'Signed-up users with the link co-edit live.' }
]

async function openShare() {
  shareOpen.value = true
  memberError.value = ''
  try {
    const res = await $fetch<{ members: Member[], share: { mode: string, token: string | null } }>(`/api/projects/${id}/members`)
    members.value = res.members
    shareMode.value = (res.share.mode as 'off' | 'view' | 'edit') || 'off'
    shareToken.value = res.share.token
  } catch { /* modal still opens with defaults */ }
}

async function setShareMode(mode: 'off' | 'view' | 'edit') {
  shareBusy.value = true
  try {
    const res = await $fetch<{ mode: typeof mode, token: string | null }>(`/api/projects/${id}/share`, { method: 'POST', body: { mode } })
    shareMode.value = res.mode
    shareToken.value = res.token
  } finally {
    shareBusy.value = false
  }
}

async function addMember() {
  const email = memberEmail.value.trim()
  if (!email) return
  memberError.value = ''
  shareBusy.value = true
  try {
    const res = await $fetch<{ member: Member }>(`/api/projects/${id}/members`, { method: 'POST', body: { email } })
    members.value = [...members.value.filter(m => m.id !== res.member.id), res.member]
    memberEmail.value = ''
  } catch (e: any) {
    memberError.value = e?.data?.statusMessage || 'Could not add that member.'
  } finally {
    shareBusy.value = false
  }
}

async function removeMember(userId: string) {
  await $fetch(`/api/projects/${id}/members`, { method: 'DELETE', body: { userId } })
  members.value = members.value.filter(m => m.id !== userId)
}

async function copyShareUrl() {
  if (!shareUrl.value) return
  await navigator.clipboard.writeText(shareUrl.value)
  toast.add({ title: 'Share link copied', icon: 'i-lucide-clipboard-check', color: 'success' })
}

const moving = ref<EmailRow | null>(null)
const moveTarget = ref<string>('root')
const moveItems = computed(() => [
  { label: '(project root)', value: 'root' },
  ...(data.value?.folders ?? []).map(f => ({ label: f.name, value: f.id }))
])

function startMove(e: EmailRow) {
  moving.value = e
  moveTarget.value = e.folderId ?? 'root'
}

async function saveMove() {
  if (!moving.value) return
  busy.value = true
  try {
    await $fetch(`/api/emails/${moving.value.id}`, {
      method: 'PUT',
      body: { folderId: moveTarget.value === 'root' ? null : moveTarget.value }
    })
    moving.value = null
    await refresh()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="project-detail-page">
    <!-- Header -->
    <div class="pd-header pc-rise">
      <div class="pd-header-left">
        <div class="pd-breadcrumbs">
          <NuxtLink to="/app" class="pd-breadcrumb">Projects</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5 pd-breadcrumb-sep" />
          <NuxtLink :to="folderLink(null)" class="pd-breadcrumb" :class="!currentFolderId && 'pd-breadcrumb--active'">
            {{ data?.project.name }}
          </NuxtLink>
          <template v-for="(f, i) in breadcrumbs" :key="f.id">
            <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5 pd-breadcrumb-sep" />
            <NuxtLink :to="folderLink(f.id)" class="pd-breadcrumb" :class="i === breadcrumbs.length - 1 && 'pd-breadcrumb--active'">
              {{ f.name }}
            </NuxtLink>
          </template>
        </div>
        <h1 class="pd-title">{{ currentFolder?.name ?? data?.project.name }}</h1>
      </div>
      <div class="pd-header-actions">
        <button v-if="data?.access === 'owner'" class="pd-action-btn" @click="openShare">
          <UIcon name="i-lucide-share-2" class="w-4 h-4" />
          Share
        </button>
        <button class="pd-action-btn" @click="creatingFolder = true">
          <UIcon name="i-lucide-folder-plus" class="w-4 h-4" />
          Folder
        </button>
        <button class="pd-action-btn" @click="fileInput?.click()">
          <UIcon name="i-lucide-upload" class="w-4 h-4" />
          Import
        </button>
        <NuxtLink :to="newEmailLink" class="pd-action-btn pd-action-btn--primary">
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          New email
        </NuxtLink>
      </div>
      <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onImportFile" >
    </div>

    <!-- New folder inline form -->
    <div v-if="creatingFolder" class="pd-create-form pc-rise-2">
      <input
        v-model="folderName"
        class="pd-create-input"
        placeholder="Folder name..."
        autofocus
        @keyup.enter="createFolder"
      >
      <button class="pd-create-btn" :disabled="busy || !folderName.trim()" @click="createFolder">
        {{ busy ? 'Creating...' : 'Create' }}
      </button>
      <button class="pd-create-cancel" @click="creatingFolder = false">Cancel</button>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="pd-grid">
      <div v-for="i in 6" :key="i" class="pd-card pd-card--skeleton">
        <div class="pd-card-thumb pd-card-thumb--skeleton" />
        <div class="pd-card-info">
          <div class="skeleton-line skeleton-line--w60" />
          <div class="skeleton-line skeleton-line--w40" />
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Folders -->
      <div v-if="subfolders.length" class="pd-section">
        <div class="pd-section-title">Folders</div>
        <div class="pd-grid">
          <div v-for="f in subfolders" :key="f.id" class="pd-folder-card">
            <NuxtLink :to="folderLink(f.id)" class="pd-folder-link">
              <div class="pd-folder-icon">
                <UIcon name="i-lucide-folder" class="w-4 h-4" />
              </div>
              <span class="pd-folder-name">{{ f.name }}</span>
            </NuxtLink>
            <div class="pd-folder-actions">
              <button class="pd-mini-btn" @click.stop="renameFolder(f)">
                <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" />
              </button>
              <button class="pd-mini-btn pd-mini-btn--danger" @click.stop="removeFolder(f)">
                <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!emailsHere.length && !subfolders.length" class="pd-empty pc-rise-2">
        <div class="pd-empty-icon">
          <UIcon name="i-lucide-mail-plus" class="w-8 h-8" />
        </div>
        <h3 class="pd-empty-title">Nothing here yet</h3>
        <p class="pd-empty-desc">Create an email or add folders to organize this project.</p>
        <NuxtLink :to="newEmailLink" class="pd-empty-btn">
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          Create an email
        </NuxtLink>
      </div>

      <!-- Emails -->
      <div v-else-if="emailsHere.length" class="pd-section">
        <div v-if="subfolders.length" class="pd-section-title">Emails</div>
        <div class="pd-grid">
          <div
            v-for="(e, i) in emailsHere"
            :key="e.id"
            class="pd-email-card pc-rise"
            :style="{ animationDelay: `${i * 0.03}s` }"
          >
            <NuxtLink :to="`/app/emails/${e.id}`" class="pd-email-link">
              <div class="pd-email-thumb">
                <div class="pd-email-thumb-icon">
                  <UIcon name="i-lucide-mail" class="w-6 h-6" />
                </div>
              </div>
              <div class="pd-email-info">
                <div class="pd-email-name">{{ e.name }}</div>
                <div class="pd-email-subject">{{ e.subject || 'No subject' }}</div>
                <div class="pd-email-meta">
                  <span class="pd-email-meta-item">
                    <UIcon name="i-lucide-clock" class="w-3 h-3" />
                    {{ when(e.updatedAt) }}
                  </span>
                  <span v-if="e.variables.length" class="pd-email-meta-item">
                    <UIcon name="i-lucide-braces" class="w-3 h-3" />
                    {{ e.variables.length }} vars
                  </span>
                </div>
              </div>
            </NuxtLink>
            <div class="pd-email-actions">
              <NuxtLink :to="`/app/emails/${e.id}`" class="pd-email-action">
                <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" />
              </NuxtLink>
              <button class="pd-email-action" @click.stop="startMove(e)">
                <UIcon name="i-lucide-folder-input" class="w-3.5 h-3.5" />
              </button>
              <button class="pd-email-action" @click.stop="duplicate(e.id)">
                <UIcon name="i-lucide-copy" class="w-3.5 h-3.5" />
              </button>
              <button class="pd-email-action pd-email-action--danger" @click.stop="removeEmail(e)">
                <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Share project -->
    <div v-if="shareOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/30" @click.self="shareOpen = false">
      <div class="pc-card p-5 w-[460px] max-w-[calc(100vw-2rem)] space-y-4 max-h-[85vh] overflow-y-auto pc-scroll">
        <div class="flex items-center justify-between">
          <div class="font-medium flex items-center gap-2">
            <UIcon name="i-lucide-share-2" class="size-4 text-primary-500" /> Share “{{ data?.project.name }}”
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Close" @click="shareOpen = false" />
        </div>

        <!-- Link sharing -->
        <div class="space-y-2">
          <button
            v-for="m in shareModes"
            :key="m.value"
            type="button"
            class="w-full rounded-lg border p-3 text-left transition"
            :class="shareMode === m.value ? 'border-primary-500 bg-primary-500/5' : 'pc-hairline hover:border-primary-500/40'"
            :disabled="shareBusy"
            @click="setShareMode(m.value as 'off' | 'view' | 'edit')"
          >
            <div class="text-sm font-medium">{{ m.label }}</div>
            <div class="text-xs pc-dim mt-0.5">{{ m.description }}</div>
          </button>
        </div>
        <div v-if="shareUrl" class="flex items-center gap-2">
          <UInput :model-value="shareUrl" readonly class="flex-1" size="sm" />
          <UButton icon="i-lucide-copy" size="sm" color="neutral" variant="subtle" @click="copyShareUrl">Copy</UButton>
        </div>

        <!-- Members -->
        <div class="border-t pc-hairline pt-4">
          <div class="text-sm font-medium mb-1">Members</div>
          <p class="text-xs pc-dim mb-3">Members can view and edit every email in this project.</p>
          <UAlert v-if="memberError" color="error" variant="soft" class="mb-2" :title="memberError" />
          <div class="flex items-center gap-2 mb-3">
            <UInput v-model="memberEmail" placeholder="teammate@example.com" class="flex-1" size="sm" @keyup.enter="addMember" />
            <UButton size="sm" color="primary" :loading="shareBusy" @click="addMember">Add</UButton>
          </div>
          <ul v-if="members.length" class="space-y-1.5">
            <li v-for="m in members" :key="m.id" class="flex items-center gap-2 text-sm">
              <span class="grid place-items-center w-6 h-6 rounded-full bg-primary-500/10 text-primary-500 text-[11px] font-semibold shrink-0">
                {{ (m.name || m.email).slice(0, 1).toUpperCase() }}
              </span>
              <span class="min-w-0 flex-1 truncate">{{ m.name || m.email }} <span class="pc-dim text-xs">{{ m.name ? m.email : '' }}</span></span>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Remove member" @click="removeMember(m.id)" />
            </li>
          </ul>
          <p v-else class="text-xs pc-dim">No members yet.</p>
        </div>
      </div>
    </div>

    <!-- Move email -->
    <div v-if="moving" class="fixed inset-0 z-50 grid place-items-center bg-black/30" @click.self="moving = null">
      <div class="pc-card p-5 w-[380px] space-y-3">
        <div class="font-medium">Move “{{ moving.name }}”</div>
        <USelect v-model="moveTarget" :items="moveItems" class="w-full" />
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="moving = null">Cancel</UButton>
          <UButton color="primary" :loading="busy" @click="saveMove">Move</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-detail-page {
  padding: 32px 40px;
  max-width: 1200px;
  margin: 0 auto;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.pd-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}

.pd-header-left {
  min-width: 0;
}

.pd-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.pd-breadcrumb {
  font-size: 13px;
  color: var(--pc-text-dim);
  text-decoration: none;
  transition: color 0.12s;
}

.pd-breadcrumb:hover {
  color: var(--pc-text);
}

.pd-breadcrumb--active {
  color: var(--pc-text);
  font-weight: 500;
}

.pd-breadcrumb-sep {
  color: var(--pc-text-muted);
}

.pd-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--pc-text);
  margin: 0;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pd-action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text);
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-decoration: none;
  font-family: inherit;
  white-space: nowrap;
}

.pd-action-btn:hover {
  background: var(--pc-hover);
  border-color: var(--pc-border-strong);
}

.pd-action-btn--primary {
  background: var(--pc-text);
  color: var(--pc-bg);
  border-color: transparent;
}

.pd-action-btn--primary:hover {
  opacity: 0.85;
}

/* ── Create form ───────────────────────────────────────────────────────── */
.pd-create-form {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  margin-bottom: 20px;
}

.pd-create-input {
  flex: 1;
  padding: 6px 0;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--pc-text);
  outline: none;
  font-family: inherit;
}

.pd-create-input::placeholder {
  color: var(--pc-text-muted);
}

.pd-create-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-bg);
  background: var(--pc-text);
  cursor: pointer;
  font-family: inherit;
  border: none;
  white-space: nowrap;
}

.pd-create-btn:hover {
  opacity: 0.85;
}

.pd-create-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pd-create-cancel {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--pc-text-dim);
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.pd-create-cancel:hover {
  color: var(--pc-text);
}

/* ── Sections ──────────────────────────────────────────────────────────── */
.pd-section {
  margin-bottom: 28px;
}

.pd-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--pc-text-dim);
  margin-bottom: 12px;
}

/* ── Grid ──────────────────────────────────────────────────────────────── */
.pd-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 12px;
}

@media (min-width: 640px) {
  .pd-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .pd-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ── Folder card ───────────────────────────────────────────────────────── */
.pd-folder-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  transition: border-color 0.15s;
}

.pd-folder-card:hover {
  border-color: var(--pc-border-strong);
}

.pd-folder-link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}

.pd-folder-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  flex-shrink: 0;
}

.pd-folder-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-folder-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.pd-folder-card:hover .pd-folder-actions {
  opacity: 1;
}

.pd-mini-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--pc-text-dim);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  background: transparent;
  border: none;
}

.pd-mini-btn:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

.pd-mini-btn--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* ── Email card ────────────────────────────────────────────────────────── */
.pd-email-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  transition: border-color 0.15s, box-shadow 0.2s;
}

.pd-email-card:hover {
  border-color: var(--pc-border-strong);
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.1);
}

.dark .pd-email-card:hover {
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
}

.pd-email-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.pd-email-thumb {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(10, 132, 255, 0.08), rgba(175, 82, 222, 0.06));
  border-bottom: 1px solid var(--pc-border);
}

.dark .pd-email-thumb {
  background: linear-gradient(135deg, rgba(10, 132, 255, 0.12), rgba(175, 82, 222, 0.08));
}

.pd-email-thumb-icon {
  color: var(--pc-text-muted);
  opacity: 0.35;
}

.pd-email-info {
  padding: 12px 14px;
}

.pd-email-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--pc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-email-subject {
  font-size: 12px;
  color: var(--pc-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.pd-email-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--pc-text-muted);
}

.pd-email-meta-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

/* Actions */
.pd-email-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.pd-email-card:hover .pd-email-actions {
  opacity: 1;
}

.pd-email-action {
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
  text-decoration: none;
}

.pd-email-action:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

.pd-email-action--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.2);
}

/* ── Empty state ───────────────────────────────────────────────────────── */
.pd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80px 20px;
}

.pd-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--pc-surface);
  color: var(--pc-text-muted);
  margin-bottom: 16px;
}

.pd-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--pc-text);
  margin: 0 0 6px;
}

.pd-empty-desc {
  font-size: 14px;
  color: var(--pc-text-dim);
  margin: 0 0 20px;
}

.pd-empty-btn {
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
  text-decoration: none;
  transition: opacity 0.15s;
}

.pd-empty-btn:hover {
  opacity: 0.85;
}

/* ── Skeleton ──────────────────────────────────────────────────────────── */
.pd-card--skeleton {
  pointer-events: none;
}

.pd-card-thumb--skeleton {
  background: var(--pc-surface);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-line {
  height: 12px;
  border-radius: 4px;
  background: var(--pc-surface);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  margin-bottom: 6px;
}

.skeleton-line--w60 { width: 60%; }
.skeleton-line--w40 { width: 40%; }

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
