<script setup lang="ts">
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
  <div class="p-8 max-w-5xl mx-auto">
    <!-- Breadcrumbs + actions -->
    <div class="flex items-end justify-between mb-6 gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 text-sm pc-dim flex-wrap">
          <NuxtLink to="/app" class="hover:text-(--pc-text) transition">Projects</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5" />
          <NuxtLink :to="folderLink(null)" class="hover:text-(--pc-text) transition" :class="!currentFolderId && 'font-medium text-(--pc-text)'">
            {{ data?.project.name }}
          </NuxtLink>
          <template v-for="(f, i) in breadcrumbs" :key="f.id">
            <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5" />
            <NuxtLink :to="folderLink(f.id)" class="hover:text-(--pc-text) transition" :class="i === breadcrumbs.length - 1 && 'font-medium text-(--pc-text)'">
              {{ f.name }}
            </NuxtLink>
          </template>
        </div>
        <h1 class="text-2xl font-semibold tracking-tight mt-1 truncate">
          {{ currentFolder?.name ?? data?.project.name }}
        </h1>
      </div>
      <div class="flex gap-2">
        <UButton v-if="data?.access === 'owner'" color="neutral" variant="subtle" icon="i-lucide-share-2" @click="openShare">Share</UButton>
        <UButton color="neutral" variant="subtle" icon="i-lucide-folder-plus" @click="creatingFolder = true">New folder</UButton>
        <UButton :to="newEmailLink" color="primary" icon="i-lucide-plus">New email</UButton>
      </div>
    </div>

    <!-- New folder inline form -->
    <div v-if="creatingFolder" class="pc-card p-4 mb-5 flex items-center gap-3">
      <UInput v-model="folderName" placeholder="Folder name…" class="flex-1" autofocus @keyup.enter="createFolder" />
      <UButton color="primary" :loading="busy" @click="createFolder">Create</UButton>
      <UButton color="neutral" variant="ghost" @click="creatingFolder = false">Cancel</UButton>
    </div>

    <div v-if="pending" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="pc-card h-36 animate-pulse" />
    </div>

    <template v-else>
      <!-- Folders -->
      <div v-if="subfolders.length" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div v-for="f in subfolders" :key="f.id" class="pc-card overflow-hidden group hover:-translate-y-0.5 hover:shadow-md transition">
          <NuxtLink :to="folderLink(f.id)" class="flex items-center gap-3 p-4">
            <div class="grid place-items-center w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
              <UIcon name="i-lucide-folder" class="w-5 h-5" />
            </div>
            <div class="font-medium truncate">{{ f.name }}</div>
          </NuxtLink>
          <div class="flex border-t pc-hairline opacity-0 group-hover:opacity-100 transition">
            <UButton variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none" icon="i-lucide-pencil" @click="renameFolder(f)">Rename</UButton>
            <UButton variant="ghost" color="error" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-trash-2" @click="removeFolder(f)">Delete</UButton>
          </div>
        </div>
      </div>

      <!-- Emails -->
      <div v-if="!emailsHere.length && !subfolders.length" class="pc-card p-16 text-center">
        <div class="grid place-items-center w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-500 mx-auto mb-4">
          <UIcon name="i-lucide-mail-plus" class="w-7 h-7" />
        </div>
        <h3 class="font-semibold text-lg">Nothing here yet</h3>
        <p class="pc-dim text-sm mt-1 max-w-sm mx-auto">Create an email or add folders to organise this project.</p>
        <UButton :to="newEmailLink" color="primary" class="mt-5" icon="i-lucide-plus">Create an email</UButton>
      </div>

      <div v-else-if="emailsHere.length" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="e in emailsHere"
          :key="e.id"
          class="pc-card overflow-hidden group hover:-translate-y-0.5 hover:shadow-md transition pc-rise"
        >
          <NuxtLink :to="`/app/emails/${e.id}`" class="block">
            <div class="h-24 bg-gradient-to-br from-primary-500/15 to-purple-500/15 grid place-items-center">
              <UIcon name="i-lucide-mail" class="w-8 h-8 text-primary-500/70" />
            </div>
            <div class="p-4">
              <div class="font-medium truncate">{{ e.name }}</div>
              <div class="text-xs pc-dim truncate mt-0.5">{{ e.subject || 'No subject' }}</div>
              <div class="flex items-center gap-3 mt-3 text-[11px] pc-dim">
                <span class="flex items-center gap-1"><UIcon name="i-lucide-clock" class="w-3 h-3" /> {{ when(e.updatedAt) }}</span>
                <span v-if="e.variables.length" class="flex items-center gap-1"><UIcon name="i-lucide-braces" class="w-3 h-3" /> {{ e.variables.length }} vars</span>
              </div>
            </div>
          </NuxtLink>
          <div class="flex border-t pc-hairline opacity-0 group-hover:opacity-100 transition">
            <UButton :to="`/app/emails/${e.id}`" variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none" icon="i-lucide-pencil">Edit</UButton>
            <UButton variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-folder-input" @click="startMove(e)">Move</UButton>
            <UButton variant="ghost" color="neutral" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-copy" @click="duplicate(e.id)">Copy</UButton>
            <UButton variant="ghost" color="error" size="xs" class="flex-1 justify-center rounded-none border-l pc-hairline" icon="i-lucide-trash-2" @click="removeEmail(e)">Delete</UButton>
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
