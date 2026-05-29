<script setup lang="ts">
/**
 * Upload modal: pick an S3 connection, choose/drop a file, upload it, and emit
 * the resulting email-ready asset. Used for both image blocks and file-download
 * links. `accept` narrows the file input (e.g. 'image/*' when adding an image).
 */
import { useEmailAssets, type UploadedAsset } from '~/composables/useEmailAssets'

const props = defineProps<{
  open: boolean
  accept?: string
  /** copy shown at the top, e.g. "Upload an image" */
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'uploaded', asset: UploadedAsset): void
}>()

const toast = useToast()
const { connections, connectionId, selectedConnection, loaded, loadConnections, upload, uploading } = useEmailAssets()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

watch(() => props.open, (o) => {
  if (o) loadConnections()
})

// USelect's model is string | undefined; our shared state uses string | null.
const connModel = computed({
  get: () => connectionId.value ?? undefined,
  set: (v: string | undefined) => { connectionId.value = v ?? null }
})

const connItems = computed(() =>
  connections.value.map(c => ({
    label: c.bucket ? `${c.name} · ${c.bucket}` : c.name,
    value: c.id
  }))
)

async function handleFile(file: File | undefined | null) {
  if (!file) return
  if (!connectionId.value) {
    toast.add({ title: 'Pick an S3 connection first', color: 'warning' })
    return
  }
  try {
    const asset = await upload(file)
    if (asset.temporary) {
      toast.add({
        title: 'Uploaded, but the link is temporary',
        description: 'This S3 connection has no public base URL, so the link expires in 7 days. Set one on the Connections page for permanent images.',
        color: 'warning',
        duration: 8000
      })
    } else {
      toast.add({ title: 'Uploaded', icon: 'i-lucide-check', color: 'success' })
    }
    emit('uploaded', asset)
    emit('update:open', false)
  } catch (e) {
    toast.add({ title: 'Upload failed', description: e instanceof Error ? e.message : undefined, color: 'error' })
  }
}

function onInputChange(e: Event) {
  handleFile((e.target as HTMLInputElement).files?.[0])
}

function onDrop(e: DragEvent) {
  dragging.value = false
  handleFile(e.dataTransfer?.files?.[0])
}
</script>

<template>
  <UModal
    :open="open"
    :title="title || 'Upload to S3'"
    description="Files are stored in your S3 bucket and linked into the email."
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="loaded && !connections.length"
          icon="i-lucide-plug"
          color="warning"
          variant="soft"
          title="No S3 connection"
          description="Add a MinIO / S3 connection on the Connections page to upload images and files."
        />

        <template v-else>
          <UFormField label="S3 connection">
            <USelect
              v-model="connModel"
              :items="connItems"
              placeholder="Select a connection"
              class="w-full"
            />
          </UFormField>

          <UAlert
            v-if="selectedConnection && !selectedConnection.hasPublicBaseUrl"
            icon="i-lucide-triangle-alert"
            color="warning"
            variant="soft"
            title="No public base URL set"
            description="Uploads will use a temporary 7-day link. Set a “Public base URL” on this connection for permanent email images."
          />

          <button
            type="button"
            class="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition"
            :class="dragging ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/50'"
            :disabled="uploading || !connectionId"
            @click="fileInput?.click()"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <UIcon
              :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-upload-cloud'"
              class="size-8 text-dimmed"
              :class="{ 'animate-spin': uploading }"
            />
            <span class="text-sm font-medium text-highlighted">
              {{ uploading ? 'Uploading…' : 'Click or drop a file here' }}
            </span>
            <span class="text-xs text-muted">
              {{ accept === 'image/*' ? 'PNG, JPG, GIF, SVG · up to 25MB' : 'Any file · up to 25MB' }}
            </span>
          </button>

          <input
            ref="fileInput"
            type="file"
            :accept="accept"
            class="hidden"
            @change="onInputChange"
          >
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          label="Manage connections"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-external-link"
          to="/connections"
          target="_blank"
        />
        <UButton
          label="Close"
          color="neutral"
          variant="ghost"
          @click="emit('update:open', false)"
        />
      </div>
    </template>
  </UModal>
</template>
