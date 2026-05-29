<script setup lang="ts">
import type { EmailDocument } from '#shared/email/blocks'
import type { EmailTemplateDefinition } from '#shared/email/templates'

/**
 * Email designer landing page: a project gallery. Create a blank project,
 * duplicate or delete existing ones, and open one in the 3-pane editor.
 */
interface EmailProjectSummary {
  id: string
  name: string
  blockCount: number
  subject: string
  createdAt: number
  updatedAt: number
}

const { data: projects, refresh } = await useFetch<EmailProjectSummary[]>('/api/email-projects', {
  key: 'email-projects',
  default: () => []
})
const toast = useToast()
const busy = ref(false)
const templateOpen = ref(false)

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

async function createProject(document?: EmailDocument, name?: string) {
  busy.value = true
  try {
    const body = document ? { document, name: name || document.settings.title } : {}
    const res = await $fetch<{ id: string }>('/api/email-projects', { method: 'POST', body })
    templateOpen.value = false
    await navigateTo(`/emails/${res.id}`)
  } catch {
    toast.add({ title: 'Could not create project', color: 'error' })
  } finally {
    busy.value = false
  }
}

function createFromTemplate(payload: { template: EmailTemplateDefinition, document: EmailDocument }) {
  createProject(payload.document, payload.template.name)
}

async function duplicate(p: EmailProjectSummary) {
  busy.value = true
  try {
    await $fetch(`/api/email-projects/${p.id}/duplicate`, { method: 'POST' })
    await refresh()
    toast.add({ title: `Duplicated “${p.name}”`, color: 'success' })
  } catch {
    toast.add({ title: 'Duplicate failed', color: 'error' })
  } finally {
    busy.value = false
  }
}

const deleteTarget = ref<EmailProjectSummary | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const name = deleteTarget.value.name
  await $fetch(`/api/email-projects/${deleteTarget.value.id}`, { method: 'DELETE' })
  deleteTarget.value = null
  await refresh()
  toast.add({ title: `Deleted “${name}”`, color: 'success' })
}

function menuItems(p: EmailProjectSummary) {
  return [[
    { label: 'Open', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/emails/${p.id}`) },
    { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => duplicate(p) },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = p } }
  ]]
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          Email designer
        </h1>
        <p class="mt-1 text-sm text-muted">
          Design email-safe templates with an AI copilot. Pick a project to keep editing, or start a new one.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="New email"
        :loading="busy"
        @click="templateOpen = true"
      />
    </div>

    <div
      v-if="projects.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="p in projects"
        :key="p.id"
        class="group cursor-pointer transition hover:ring-primary/40"
        :ui="{ body: 'sm:p-5' }"
        @click="navigateTo(`/emails/${p.id}`)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <UIcon
              name="i-lucide-mail"
              class="size-5"
            />
          </div>
          <UDropdownMenu
            :items="menuItems(p)"
            @click.stop
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              @click.stop
            />
          </UDropdownMenu>
        </div>
        <h3 class="mt-3 truncate text-sm font-semibold text-highlighted">
          {{ p.name }}
        </h3>
        <p class="mt-0.5 truncate text-xs text-muted">
          {{ p.subject || 'No subject set' }}
        </p>
        <div class="mt-3 flex items-center gap-3 text-xs text-dimmed">
          <span class="inline-flex items-center gap-1">
            <UIcon
              name="i-lucide-layers"
              class="size-3.5"
            />
            {{ p.blockCount }} block{{ p.blockCount === 1 ? '' : 's' }}
          </span>
          <span class="inline-flex items-center gap-1">
            <UIcon
              name="i-lucide-clock"
              class="size-3.5"
            />
            {{ relTime(p.updatedAt) }}
          </span>
        </div>
      </UCard>
    </div>

    <div
      v-else
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-default py-20 text-center"
    >
      <div class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <UIcon
          name="i-lucide-mail-plus"
          class="size-6"
        />
      </div>
      <h3 class="mt-4 text-sm font-semibold text-highlighted">
        No email projects yet
      </h3>
      <p class="mt-1 max-w-sm text-sm text-muted">
        Create your first email and describe what you want — the AI will build it block by block.
      </p>
      <UButton
        class="mt-5"
        icon="i-lucide-plus"
        label="New email"
        :loading="busy"
        @click="templateOpen = true"
      />
    </div>

    <EmailEmailTemplatePicker
      v-model:open="templateOpen"
      :busy="busy"
      @select="createFromTemplate"
      @blank="createProject"
    />

    <UModal
      :open="!!deleteTarget"
      title="Delete email project"
      :description="deleteTarget ? `“${deleteTarget.name}” and its chat history will be permanently removed.` : ''"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="deleteTarget = null"
          />
          <UButton
            label="Delete"
            color="error"
            icon="i-lucide-trash-2"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
