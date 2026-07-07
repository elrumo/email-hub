<script setup lang="ts">
/**
 * Public share preview — no app chrome, just the rendered email and a
 * device-size switcher. Handles both a shared email and a shared project
 * (with a document picker). If the link allows editing, signed-in visitors
 * get an "Open in editor" button; signed-out ones are invited to sign in.
 */
definePageMeta({ layout: false })

interface SharedEmailPayload {
  type: 'email'
  name: string
  subject: string
  html: string
  canEdit: boolean
  editUrl: string | null
  signInToEdit: boolean
}
interface SharedProjectPayload {
  type: 'project'
  name: string
  canEdit: boolean
  signInToEdit: boolean
  emails: Array<{ id: string, name: string, subject: string, editUrl: string | null }>
}

const route = useRoute()
const token = route.params.token as string

const { data, error } = await useFetch<SharedEmailPayload | SharedProjectPayload>(`/api/share/${token}`)

useHead({ title: () => `${data.value?.name ?? 'Shared email'} — Postcard` })

const devices = [
  { id: 'phone', label: 'Phone', icon: 'i-lucide-smartphone', width: 375 },
  { id: 'tablet', label: 'Tablet', icon: 'i-lucide-tablet', width: 768 },
  { id: 'desktop', label: 'Desktop', icon: 'i-lucide-monitor', width: 0 }
] as const
const deviceId = ref<(typeof devices)[number]['id']>('desktop')
const device = computed(() => devices.find(d => d.id === deviceId.value) ?? devices[2])

// Shared-project state: which document is being previewed.
const selectedEmailId = ref<string | null>(null)
const projectHtml = ref('')
const loadingHtml = ref(false)

const project = computed(() => (data.value?.type === 'project' ? data.value : null))
const email = computed(() => (data.value?.type === 'email' ? data.value : null))

watch([data, selectedEmailId], async () => {
  if (!project.value) return
  const target = selectedEmailId.value ?? project.value.emails[0]?.id
  if (!target) return
  if (!selectedEmailId.value) {
    selectedEmailId.value = target
    return
  }
  loadingHtml.value = true
  try {
    const res = await $fetch<{ html: string }>(`/api/share/${token}/${target}`)
    projectHtml.value = res.html
  } finally {
    loadingHtml.value = false
  }
}, { immediate: true })

const html = computed(() => email.value?.html ?? projectHtml.value)
const selectedEmail = computed(() => project.value?.emails.find(e => e.id === selectedEmailId.value) ?? null)
const editUrl = computed(() => email.value?.editUrl ?? selectedEmail.value?.editUrl ?? null)
const signInToEdit = computed(() => !!data.value?.signInToEdit)
const signInLink = computed(() => `/login?redirect=${encodeURIComponent(route.fullPath)}`)
</script>

<template>
  <div class="min-h-screen bg-(--pc-bg) flex flex-col">
    <!-- Minimal top bar: subject + device tabs, nothing else -->
    <div class="flex items-center gap-3 px-4 py-2.5 border-b pc-hairline pc-material">
      <UIcon name="i-lucide-mail" class="w-4 h-4 text-primary-500 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">{{ data?.name ?? 'Shared email' }}</div>
      </div>

      <USelect
        v-if="project && project.emails.length > 1"
        :model-value="selectedEmailId ?? undefined"
        :items="project.emails.map(e => ({ label: e.name, value: e.id }))"
        size="sm"
        class="w-52"
        @update:model-value="selectedEmailId = String($event)"
      />

      <UFieldGroup>
        <UButton
          v-for="d in devices"
          :key="d.id"
          :icon="d.icon"
          size="xs"
          :color="deviceId === d.id ? 'primary' : 'neutral'"
          :variant="deviceId === d.id ? 'soft' : 'outline'"
          :aria-label="d.label"
          @click="deviceId = d.id"
        />
      </UFieldGroup>

      <UButton v-if="editUrl" :to="editUrl" size="xs" color="primary" icon="i-lucide-pencil">Open in editor</UButton>
      <UButton v-else-if="signInToEdit" :to="signInLink" size="xs" color="neutral" variant="subtle" icon="i-lucide-log-in">Sign in to edit</UButton>
    </div>

    <div v-if="error" class="flex-1 grid place-items-center p-8">
      <div class="text-center">
        <UIcon name="i-lucide-link-2-off" class="w-10 h-10 pc-dim mx-auto mb-3" />
        <div class="font-medium">This share link is no longer active</div>
        <p class="pc-dim text-sm mt-1">Ask the sender for a fresh link.</p>
      </div>
    </div>

    <!-- The email itself: no UI, just the rendered template -->
    <div v-else class="flex-1 min-h-0 p-4 flex justify-center overflow-auto pc-scroll">
      <iframe
        :key="deviceId"
        :srcdoc="html"
        sandbox="allow-popups"
        class="bg-white rounded-lg shadow-lg border pc-hairline h-full"
        :style="{ width: device.width ? `${device.width}px` : '100%', maxWidth: '100%', minHeight: '80vh', opacity: loadingHtml ? 0.5 : 1 }"
        title="Email preview"
      />
    </div>
  </div>
</template>
