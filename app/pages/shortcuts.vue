<script setup lang="ts">
import type { Shortcut } from '~/types'

const { data: shortcuts, refresh } = await useFetch<Shortcut[]>('/api/shortcuts', {
  key: 'shortcuts',
  default: () => []
})
const toast = useToast()

// poll liveness for every ping-enabled shortcut while this page is open
const { results: pings } = usePing(shortcuts)

// a small curated icon set; users can also type any lucide name
const ICON_CHOICES = [
  'i-lucide-link', 'i-lucide-globe', 'i-simple-icons-github', 'i-lucide-server',
  'i-lucide-database', 'i-lucide-mail', 'i-lucide-calendar', 'i-lucide-folder',
  'i-lucide-book-open', 'i-lucide-terminal', 'i-lucide-cloud', 'i-lucide-activity',
  'i-lucide-gauge', 'i-lucide-shield', 'i-lucide-bar-chart-3', 'i-lucide-settings'
]

// editor modal state
const open = ref(false)
const editing = ref<Shortcut | null>(null)
const saving = ref(false)
const form = reactive({
  name: '',
  url: '',
  icon: 'i-lucide-link',
  pingEnabled: false,
  pingUrl: '',
  pingInterval: 30
})

// favicon auto-fetch state
const fetchingFavicon = ref(false)
const fetchedFavicon = ref<string | null>(null)
// only auto-apply a fetched favicon while the user hasn't picked their own icon
const iconTouched = ref(false)

function openAdd() {
  editing.value = null
  Object.assign(form, { name: '', url: '', icon: 'i-lucide-link', pingEnabled: false, pingUrl: '', pingInterval: 30 })
  fetchedFavicon.value = null
  iconTouched.value = false
  open.value = true
}

function openEdit(s: Shortcut) {
  editing.value = s
  Object.assign(form, {
    name: s.name,
    url: s.url,
    icon: s.icon || 'i-lucide-link',
    pingEnabled: s.pingEnabled,
    pingUrl: s.pingUrl || '',
    pingInterval: s.pingInterval
  })
  fetchedFavicon.value = isImageIcon(s.icon) ? s.icon : null
  // treat an existing icon as user-chosen so we don't clobber it on open
  iconTouched.value = true
  open.value = true
}

/** Resolve the site's favicon via the server, applying it unless the user has
 * already chosen a custom icon. */
async function fetchFavicon(url: string, { auto = false }: { auto?: boolean } = {}) {
  if (!/^https?:\/\//i.test(url)) return
  fetchingFavicon.value = true
  try {
    const { icon } = await $fetch<{ icon: string | null }>('/api/shortcuts/favicon', {
      method: 'POST',
      body: { url }
    })
    if (!icon) {
      if (!auto) toast.add({ title: 'No favicon found for that site', color: 'warning' })
      return
    }
    fetchedFavicon.value = icon
    // auto-apply only when the user hasn't manually overridden the icon
    if (!auto || !iconTouched.value) form.icon = icon
  } catch {
    if (!auto) toast.add({ title: 'Could not fetch favicon', color: 'error' })
  } finally {
    fetchingFavicon.value = false
  }
}

// debounced auto-fetch as the URL is typed in the modal
let faviconTimer: ReturnType<typeof setTimeout> | undefined
watch(() => form.url, (url) => {
  if (!open.value) return
  clearTimeout(faviconTimer)
  faviconTimer = setTimeout(() => fetchFavicon(url, { auto: true }), 600)
})

function chooseIcon(value: string) {
  iconTouched.value = true
  form.icon = value
}

async function save() {
  if (!form.name.trim() || !form.url.trim()) {
    toast.add({ title: 'Name and URL are required', color: 'warning' })
    return
  }
  saving.value = true
  const body = {
    name: form.name,
    url: form.url,
    icon: form.icon,
    pingEnabled: form.pingEnabled,
    pingUrl: form.pingEnabled ? form.pingUrl : '',
    pingInterval: form.pingInterval
  }
  try {
    if (editing.value) {
      await $fetch(`/api/shortcuts/${editing.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/shortcuts', { method: 'POST', body })
    }
    open.value = false
    await refresh()
    toast.add({ title: 'Shortcut saved', color: 'success' })
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
    toast.add({ title: msg, color: 'error' })
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<Shortcut | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  await $fetch(`/api/shortcuts/${deleteTarget.value.id}`, { method: 'DELETE' })
  deleteTarget.value = null
  await refresh()
  toast.add({ title: 'Shortcut removed', color: 'success' })
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between animate-rise">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          Shortcuts
        </h1>
        <p class="mt-1 text-sm text-muted">
          Quick links to your services. Turn on a ping to watch each one go up or down live while this page is open.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Add shortcut"
        class="self-start"
        @click="openAdd"
      />
    </div>

    <div
      v-if="shortcuts.length === 0"
      class="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-default py-20 text-center"
    >
      <span class="flex size-12 items-center justify-center rounded-2xl bg-elevated text-dimmed">
        <UIcon
          name="i-lucide-link"
          class="size-6"
        />
      </span>
      <div class="space-y-1">
        <p class="font-medium text-highlighted">
          No shortcuts yet
        </p>
        <p class="text-sm text-muted">
          Add a link to a dashboard, an app, or anything you open often.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Add shortcut"
        @click="openAdd"
      />
    </div>

    <div
      v-else
      class="grid gap-3 sm:grid-cols-4 stagger"
    >
      <ShortcutCard
        v-for="s in shortcuts"
        :key="s.id"
        :shortcut="s"
        :ping="pings[s.id]"
        @edit="openEdit(s)"
        @delete="deleteTarget = s"
      />
    </div>

    <!-- add/edit modal -->
    <UModal
      v-model:open="open"
      :title="editing ? 'Edit shortcut' : 'Add shortcut'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="form.name"
              placeholder="My dashboard"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="URL"
            required
            description="Where the shortcut opens. Must be http or https."
          >
            <UInput
              v-model="form.url"
              type="url"
              placeholder="https://example.com"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Icon"
            description="Auto-filled from the site's favicon. Pick a different icon any time."
          >
            <div class="flex items-center gap-2">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-elevated">
                <img
                  v-if="isImageIcon(form.icon)"
                  :src="form.icon"
                  alt=""
                  class="size-5 rounded"
                >
                <UIcon
                  v-else
                  :name="form.icon || 'i-lucide-link'"
                  class="size-5 text-muted"
                />
              </span>
              <USelectMenu
                :model-value="isImageIcon(form.icon) ? undefined : form.icon"
                :items="ICON_CHOICES"
                create-item
                placeholder="Favicon"
                class="w-full"
                @update:model-value="chooseIcon"
                @create="chooseIcon"
              >
                <template #item-leading="{ item }">
                  <UIcon
                    :name="item"
                    class="size-4"
                  />
                </template>
              </USelectMenu>
              <UButton
                icon="i-lucide-image-down"
                color="neutral"
                variant="outline"
                square
                :loading="fetchingFavicon"
                :disabled="!/^https?:\/\//i.test(form.url)"
                aria-label="Fetch favicon"
                @click="fetchFavicon(form.url)"
              />
            </div>
            <div
              v-if="fetchedFavicon && form.icon !== fetchedFavicon"
              class="mt-2"
            >
              <UButton
                color="neutral"
                variant="soft"
                size="xs"
                @click="chooseIcon(fetchedFavicon)"
              >
                <img
                  :src="fetchedFavicon"
                  alt=""
                  class="size-4 rounded"
                >
                Use site favicon
              </UButton>
            </div>
          </UFormField>

          <USeparator />

          <UFormField
            label="Ping for liveness"
            description="While this page is open, check the URL every few seconds and show up/down."
            :ui="{ container: 'flex' }"
          >
            <USwitch v-model="form.pingEnabled" />
          </UFormField>

          <template v-if="form.pingEnabled">
            <UFormField
              label="Ping URL"
              description="Optional — leave blank to ping the shortcut URL itself. Use this for a dedicated /health endpoint."
            >
              <UInput
                v-model="form.pingUrl"
                type="url"
                :placeholder="form.url || 'https://example.com/health'"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Interval (seconds)"
              description="Between 5 and 3600."
            >
              <UInputNumber
                v-model="form.pingInterval"
                :min="5"
                :max="3600"
                class="w-full"
              />
            </UFormField>
          </template>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="close"
          />
          <UButton
            :label="editing ? 'Save' : 'Add'"
            :loading="saving"
            @click="save"
          />
        </div>
      </template>
    </UModal>

    <!-- delete confirm -->
    <UModal
      :open="!!deleteTarget"
      title="Remove shortcut?"
      :description="`“${deleteTarget?.name}” will be removed, along with any home-screen tile that uses it.`"
      :ui="{ footer: 'justify-end' }"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="deleteTarget = null"
        />
        <UButton
          label="Remove"
          color="error"
          @click="confirmDelete"
        />
      </template>
    </UModal>
  </UContainer>
</template>
