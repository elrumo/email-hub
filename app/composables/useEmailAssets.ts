/**
 * Shared state + actions for uploading email assets to an S3 connection.
 *
 * Holds the list of available S3 connections and the user's chosen one (across
 * the editor session), and exposes `upload(file)` which POSTs to
 * /api/email-projects/upload and returns the email-ready URL + metadata. Used by
 * the image inspector and the "add image/file" flows.
 */
export interface S3ConnectionOption {
  id: string
  name: string
  bucket: string
  hasPublicBaseUrl: boolean
}

export interface UploadedAsset {
  url: string
  key: string
  kind: 'image' | 'file'
  contentType: string
  size: number
  name: string
  temporary: boolean
}

export function useEmailAssets() {
  const connections = useState<S3ConnectionOption[]>('email-s3-connections', () => [])
  const connectionId = useState<string | null>('email-s3-connection-id', () => null)
  const loaded = useState<boolean>('email-s3-loaded', () => false)
  const uploading = ref(false)

  async function loadConnections() {
    if (loaded.value) return
    try {
      const list = await $fetch<S3ConnectionOption[]>('/api/email-projects/s3-connections')
      connections.value = list
      // default to the first connection that has a public base URL, else the first
      if (!connectionId.value && list.length) {
        connectionId.value = (list.find(c => c.hasPublicBaseUrl) ?? list[0])!.id
      }
    } finally {
      loaded.value = true
    }
  }

  const selectedConnection = computed(() =>
    connections.value.find(c => c.id === connectionId.value) ?? null
  )

  async function upload(file: File): Promise<UploadedAsset> {
    if (!connectionId.value) throw new Error('Pick an S3 connection first')
    uploading.value = true
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('connectionId', connectionId.value)
      return await $fetch<UploadedAsset>('/api/email-projects/upload', { method: 'POST', body: form })
    } finally {
      uploading.value = false
    }
  }

  return {
    connections,
    connectionId,
    selectedConnection,
    loaded,
    uploading,
    loadConnections,
    upload
  }
}
