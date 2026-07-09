<script setup lang="ts">
import type { EmailDocument } from '#shared/email/blocks'
import EmailCardPreview from '~/components/email/EmailCardPreview.vue'

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
  document: EmailDocument
}

interface SavedTemplateMeta {
  id: string
  name: string
  description: string
  updatedAt: number
}

const { data } = await useFetch<{ templates: TemplateMeta[], userTemplates?: SavedTemplateMeta[] }>('/api/templates')
const route = useRoute()
const creating = ref<string | null>(null)
const error = ref('')
const prompt = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const activeTab = ref('all')

const projectId = (route.query.projectId as string) || undefined
const folderId = (route.query.folderId as string) || undefined

const quickActions = [
  { label: 'Product launch', icon: 'i-lucide-rocket', templateId: 'launch-bold' },
  { label: 'Newsletter', icon: 'i-lucide-newspaper', templateId: 'newsletter-editorial' },
  { label: 'Flash sale', icon: 'i-lucide-badge-percent', templateId: 'promotion-minimal' },
  { label: 'Welcome email', icon: 'i-lucide-hand-heart', templateId: 'welcome-soft' },
  { label: 'Event invite', icon: 'i-lucide-calendar-days', templateId: 'event-dark' },
]

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'Launch', label: 'Launches' },
  { id: 'Newsletter', label: 'Newsletters' },
  { id: 'Promotion', label: 'Promotions' },
  { id: 'Welcome', label: 'Welcome' },
  { id: 'Event', label: 'Events' },
  { id: 'Transactional', label: 'Transactional' },
]

const filteredTemplates = computed(() => {
  if (activeTab.value === 'all') return data.value?.templates ?? []
  return (data.value?.templates ?? []).filter(t => t.type === activeTab.value)
})

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function uploadHtml(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  error.value = ''
  uploading.value = true
  creating.value = 'upload'
  try {
    const form = new FormData()
    form.append('file', file)
    if (projectId) form.append('projectId', projectId)
    if (folderId) form.append('folderId', folderId)
    const { project } = await $fetch<{ project: { id: string } }>('/api/emails/upload', {
      method: 'POST',
      body: form
    })
    await navigateTo(`/app/emails/${project.id}`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Upload failed.'
    creating.value = null
  } finally {
    uploading.value = false
  }
}

async function create(templateId?: string, userTemplateId?: string, aiPrompt?: string) {
  error.value = ''
  creating.value = userTemplateId || templateId || 'blank'
  try {
    const { project } = await $fetch<{ project: { id: string } }>('/api/emails', {
      method: 'POST',
      body: { templateId, userTemplateId, projectId, folderId }
    })
    // Hand a described email straight to Postcard AI in the editor.
    const suffix = aiPrompt ? `?prompt=${encodeURIComponent(aiPrompt)}` : ''
    await navigateTo(`/app/emails/${project.id}${suffix}`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not create the email.'
    creating.value = null
  }
}

function handleSubmit() {
  create(undefined, undefined, prompt.value.trim() || undefined)
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}
</script>

<template>
  <div class="new-email-page pc-scroll">
    <!-- Hero -->
    <section class="new-hero">
      <div class="new-hero-content">
        <h1 class="new-hero-title pc-rise">What do you want to create?</h1>
        <p class="new-hero-sub pc-rise-2">Describe your email and Postcard AI will bring it to life.</p>

        <!-- Prompt Input -->
        <div class="new-prompt-card pc-rise-2">
          <textarea
            ref="textarea"
            v-model="prompt"
            class="new-prompt-input"
            placeholder="Describe your email…"
            rows="1"
            @input="autoResize"
            @keydown="handleKeydown"
          />
          <div class="new-prompt-footer">
            <div class="new-prompt-model">
              <span class="new-prompt-dot" />
              <span>Postcard AI</span>
            </div>
            <div class="new-prompt-actions">
              <button class="new-prompt-attach" aria-label="Attach file">
                <UIcon name="i-lucide-paperclip" class="w-4 h-4" />
              </button>
              <button
                class="new-prompt-send"
                :disabled="!!creating"
                aria-label="Send"
                @click="handleSubmit"
              >
                <UIcon name="i-lucide-arrow-up" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="new-quick-actions pc-rise-3">
          <button
            v-for="action in quickActions"
            :key="action.templateId"
            class="new-quick-card"
            :disabled="!!creating"
            @click="create(action.templateId)"
          >
            <div class="new-quick-icon" :style="{ background: action.templateId === 'launch-bold' ? 'rgba(37,99,235,0.1)' : action.templateId === 'newsletter-editorial' ? 'rgba(15,118,110,0.1)' : action.templateId === 'promotion-minimal' ? 'rgba(220,38,38,0.1)' : action.templateId === 'welcome-soft' ? 'rgba(124,58,237,0.1)' : 'rgba(245,158,11,0.1)' }">
              <UIcon :name="action.icon" class="w-4 h-4" />
            </div>
            <span class="new-quick-label">{{ action.label }}</span>
          </button>
          <button
            class="new-quick-card"
            :disabled="!!creating"
            @click="fileInput?.click()"
          >
            <div class="new-quick-icon" style="background: rgba(108,108,115,0.1)">
              <UIcon :name="creating === 'upload' ? 'i-lucide-loader-circle' : 'i-lucide-upload'" class="w-4 h-4" :class="creating === 'upload' && 'animate-spin'" />
            </div>
            <span class="new-quick-label">Upload HTML</span>
          </button>
          <input ref="fileInput" type="file" accept=".html,.htm" class="hidden" @change="uploadHtml" >
        </div>
      </div>
    </section>

    <!-- Templates -->
    <section class="new-templates">
      <div class="new-templates-header">
        <h2 class="new-templates-title">Start with a template</h2>
        <div class="new-templates-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="new-tab"
            :class="activeTab === tab.id && 'new-tab--active'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <UAlert v-if="error" color="error" variant="soft" class="mb-5" :title="error" />

      <!-- The user's saved templates -->
      <template v-if="data?.userTemplates?.length">
        <div class="mb-3 text-xs font-medium uppercase tracking-wide pc-dim">Your templates</div>
        <div class="new-templates-grid mb-8">
          <button
            v-for="t in data.userTemplates"
            :key="t.id"
            class="new-template-card"
            :disabled="!!creating"
            @click="create(undefined, t.id)"
          >
            <div class="new-template-preview new-template-preview--blank">
              <div class="new-blank-icon">
                <UIcon :name="creating === t.id ? 'i-lucide-loader-circle' : 'i-lucide-bookmark'" class="w-7 h-7" :class="creating === t.id && 'animate-spin'" />
              </div>
            </div>
            <div class="new-template-info">
              <span class="new-template-name">{{ t.name }}</span>
              <span class="new-template-desc">{{ t.description || 'A template you saved.' }}</span>
            </div>
          </button>
        </div>
      </template>

      <div class="new-templates-grid">
        <!-- Blank Canvas -->
        <button
          class="new-template-card"
          :disabled="!!creating"
          @click="create()"
        >
          <div class="new-template-preview new-template-preview--blank">
            <div class="new-blank-icon">
              <UIcon :name="creating === 'blank' ? 'i-lucide-loader-circle' : 'i-lucide-file'" class="w-7 h-7" :class="creating === 'blank' && 'animate-spin'" />
            </div>
          </div>
          <div class="new-template-info">
            <span class="new-template-name">Blank canvas</span>
            <span class="new-template-desc">Start from scratch and ask the AI.</span>
          </div>
        </button>

        <!-- Template Cards -->
        <button
          v-for="t in filteredTemplates"
          :key="t.id"
          class="new-template-card"
          :disabled="!!creating"
          @click="create(t.id)"
        >
          <div class="new-template-preview">
            <EmailCardPreview :document="t.document" />
          </div>
          <div class="new-template-info">
            <span class="new-template-name">{{ t.name }}</span>
            <span class="new-template-desc">{{ t.description }}</span>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.new-email-page {
  min-height: 100%;
}

/* ── Hero ──────────────────────────────────────────────────────────────── */
.new-hero {
  padding: 56px 24px 32px;
  display: flex;
  justify-content: center;
}

.new-hero-content {
  width: 100%;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.new-hero-title {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--pc-text);
  margin: 0 0 10px;
  line-height: 1.15;
}

.new-hero-sub {
  font-size: 15px;
  color: var(--pc-text-dim);
  margin: 0 0 28px;
}

/* ── Prompt card ───────────────────────────────────────────────────────── */
.new-prompt-card {
  width: 100%;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border-strong);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.new-prompt-card:focus-within {
  border-color: rgba(10, 132, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.08);
}

.new-prompt-input {
  width: 100%;
  min-height: 48px;
  max-height: 160px;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.55;
  color: var(--pc-text);
  resize: none;
  padding: 16px 18px 4px;
}

.new-prompt-input::placeholder {
  color: var(--pc-text-muted);
}

.new-prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 10px 14px;
}

.new-prompt-model {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--pc-text-dim);
  user-select: none;
}

.new-prompt-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.new-prompt-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.new-prompt-attach {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--pc-text-dim);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  background: transparent;
  border: none;
  font-family: inherit;
}

.new-prompt-attach:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

.new-prompt-send {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--pc-text);
  color: var(--pc-bg);
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
  font-family: inherit;
}

.new-prompt-send:hover {
  opacity: 0.85;
}

.new-prompt-send:disabled {
  opacity: 0.3;
}

/* ── Quick actions ─────────────────────────────────────────────────────── */
.new-quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 20px;
}

.new-quick-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--pc-border);
  background: var(--pc-window-solid);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  font-family: inherit;
}

.new-quick-card:hover {
  border-color: var(--pc-border-strong);
  background: var(--pc-hover);
}

.new-quick-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.new-quick-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: var(--pc-text);
  flex-shrink: 0;
}

.new-quick-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text);
  white-space: nowrap;
}

/* ── Templates section ─────────────────────────────────────────────────── */
.new-templates {
  padding: 8px 24px 64px;
  max-width: 1100px;
  margin: 0 auto;
}

.new-templates-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.new-templates-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--pc-text);
  margin: 0;
}

.new-templates-tabs {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.new-tab {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 450;
  color: var(--pc-text-dim);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
  font-family: inherit;
}

.new-tab:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

.new-tab--active {
  background: var(--pc-hover);
  color: var(--pc-text);
  font-weight: 500;
}

/* ── Template grid ─────────────────────────────────────────────────────── */
.new-templates-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 14px;
}

@media (min-width: 640px) {
  .new-templates-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .new-templates-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ── Template card ─────────────────────────────────────────────────────── */
.new-template-card {
  display: flex;
  flex-direction: column;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  text-align: left;
  font-family: inherit;
}

.new-template-card:hover {
  border-color: var(--pc-border-strong);
  box-shadow: 0 4px 24px -4px rgba(0, 0, 0, 0.08);
}

.dark .new-template-card:hover {
  box-shadow: 0 4px 24px -4px rgba(0, 0, 0, 0.4);
}

.new-template-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.new-template-preview {
  height: 200px;
  overflow: hidden;
  position: relative;
  border-bottom: 1px solid var(--pc-border);
}

.new-template-preview--blank {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pc-surface);
}

.new-blank-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--pc-hover);
  color: var(--pc-text-dim);
}

.new-template-info {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.new-template-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--pc-text);
}

.new-template-desc {
  font-size: 12px;
  color: var(--pc-text-dim);
  line-height: 1.4;
}
</style>
