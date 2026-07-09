<script setup lang="ts">
import { renderEmailHtml } from '#shared/email/render'
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

const { data } = await useFetch<{ templates: TemplateMeta[] }>('/api/templates')
const route = useRoute()
const creating = ref<string | null>(null)
const error = ref('')
const prompt = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

const projectId = (route.query.projectId as string) || undefined
const folderId = (route.query.folderId as string) || undefined

const quickActions = [
  { label: 'Product launch', icon: 'i-lucide-rocket', templateId: 'launch-bold' },
  { label: 'Newsletter', icon: 'i-lucide-newspaper', templateId: 'newsletter-editorial' },
  { label: 'Flash sale', icon: 'i-lucide-badge-percent', templateId: 'promotion-minimal' },
  { label: 'Welcome email', icon: 'i-lucide-hand-heart', templateId: 'welcome-soft' },
  { label: 'Event invite', icon: 'i-lucide-calendar-days', templateId: 'event-dark' },
  { label: 'Account update', icon: 'i-lucide-shield-check', templateId: 'transactional-utility' },
]

async function create(templateId?: string) {
  error.value = ''
  creating.value = templateId || 'blank'
  try {
    const { project } = await $fetch<{ project: { id: string } }>('/api/emails', {
      method: 'POST',
      body: { templateId, projectId, folderId }
    })
    await navigateTo(`/app/emails/${project.id}`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not create the email.'
    creating.value = null
  }
}

function handleSubmit() {
  create()
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
      <div class="new-hero-bg" />
      <div class="new-hero-content">
        <h1 class="new-hero-title pc-rise">What do you want to create?</h1>
        <p class="new-hero-sub pc-rise-2">Describe your email and Postcard AI will bring it to life.</p>

        <!-- AI Prompt Input -->
        <div class="new-prompt-card pc-rise-2">
          <div class="new-prompt-inner">
            <textarea
              ref="textarea"
              v-model="prompt"
              class="new-prompt-input"
              placeholder="Describe your email…"
              rows="1"
              @input="autoResize"
              @keydown="handleKeydown"
            />
          </div>
          <div class="new-prompt-footer">
            <div class="new-prompt-hint">
              <span class="new-prompt-hint-dot" />
              Postcard AI
            </div>
            <UButton
              color="primary"
              variant="ghost"
              size="xs"
              icon="i-lucide-arrow-up"
              :disabled="!!creating"
              class="new-prompt-send"
              @click="handleSubmit"
            />
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="new-quick-actions pc-rise-3">
          <button
            v-for="action in quickActions"
            :key="action.templateId"
            class="new-quick-chip"
            :disabled="!!creating"
            @click="create(action.templateId)"
          >
            <UIcon :name="action.icon" class="w-3.5 h-3.5" />
            {{ action.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- Templates -->
    <section class="new-templates">
      <div class="new-templates-header">
        <h2 class="new-templates-title">Start with a template</h2>
      </div>

      <UAlert v-if="error" color="error" variant="soft" class="mb-5 mx-auto max-w-6xl" :title="error" />

      <div class="new-templates-grid">
        <!-- Blank Canvas -->
        <button
          class="new-template-card"
          :disabled="!!creating"
          @click="create()"
        >
          <div class="new-template-preview new-template-preview--blank">
            <div class="new-blank-icon">
              <UIcon :name="creating === 'blank' ? 'i-lucide-loader-circle' : 'i-lucide-file'" class="w-8 h-8" :class="creating === 'blank' && 'animate-spin'" />
            </div>
          </div>
          <div class="new-template-info">
            <span class="new-template-name">Blank canvas</span>
            <span class="new-template-desc">A clean slate. Build it your way or ask the AI.</span>
          </div>
        </button>

        <!-- Template Cards with Previews -->
        <button
          v-for="t in data?.templates"
          :key="t.id"
          class="new-template-card"
          :disabled="!!creating"
          @click="create(t.id)"
        >
          <div class="new-template-preview">
            <EmailCardPreview :document="t.document" />
          </div>
          <div class="new-template-info">
            <div class="new-template-meta">
              <span class="new-template-name">{{ t.name }}</span>
              <UBadge color="neutral" variant="soft" size="sm">{{ t.style }}</UBadge>
            </div>
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
  position: relative;
  padding: 48px 24px 40px;
  display: flex;
  justify-content: center;
  overflow: hidden;
}

.new-hero-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 50% at 30% 20%, rgba(10, 132, 255, 0.12), transparent 70%),
    radial-gradient(50% 50% at 70% 30%, rgba(175, 82, 222, 0.1), transparent 70%),
    radial-gradient(40% 40% at 50% 80%, rgba(48, 209, 88, 0.08), transparent 70%);
  pointer-events: none;
}

:root.dark .new-hero-bg {
  background:
    radial-gradient(60% 50% at 30% 20%, rgba(10, 132, 255, 0.18), transparent 70%),
    radial-gradient(50% 50% at 70% 30%, rgba(175, 82, 222, 0.15), transparent 70%),
    radial-gradient(40% 40% at 50% 80%, rgba(48, 209, 88, 0.1), transparent 70%);
}

.new-hero-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.new-hero-title {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--pc-text);
  margin: 0 0 8px;
  line-height: 1.2;
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
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.1);
}

.new-prompt-inner {
  padding: 16px 18px 4px;
}

.new-prompt-input {
  width: 100%;
  min-height: 36px;
  max-height: 160px;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.55;
  color: var(--pc-text);
  resize: none;
  padding: 0;
}

.new-prompt-input::placeholder {
  color: var(--pc-text-dim);
  opacity: 0.7;
}

.new-prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 10px 14px;
}

.new-prompt-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--pc-text-dim);
  user-select: none;
}

.new-prompt-hint-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.new-prompt-send {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--pc-text);
  color: var(--pc-bg);
  transition: opacity 0.15s;
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
  margin-top: 18px;
}

.new-quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 9999px;
  border: 1px solid var(--pc-border);
  background: var(--pc-window-solid);
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
  font-family: inherit;
}

.new-quick-chip:hover {
  background: rgba(10, 132, 255, 0.08);
  border-color: rgba(10, 132, 255, 0.3);
}

:root.dark .new-quick-chip:hover {
  background: rgba(10, 132, 255, 0.15);
}

.new-quick-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Templates section ─────────────────────────────────────────────────── */
.new-templates {
  padding: 0 24px 48px;
  max-width: 1100px;
  margin: 0 auto;
}

.new-templates-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.new-templates-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--pc-text);
  margin: 0;
}

.new-templates-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 16px;
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
  border-radius: var(--radius-card);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  text-align: left;
  font-family: inherit;
}

.new-template-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px -12px rgba(0, 0, 0, 0.15);
  border-color: var(--pc-border-strong);
}

:root.dark .new-template-card:hover {
  box-shadow: 0 16px 50px -12px rgba(0, 0, 0, 0.5);
}

.new-template-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.new-template-preview {
  height: 220px;
  overflow: hidden;
  position: relative;
  border-bottom: 1px solid var(--pc-border);
}

.new-template-preview--blank {
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(40% 50% at 30% 30%, rgba(10, 132, 255, 0.06), transparent 70%),
    radial-gradient(40% 50% at 70% 70%, rgba(175, 82, 222, 0.05), transparent 70%);
}

.new-blank-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: rgba(108, 108, 115, 0.1);
  color: var(--pc-text-dim);
}

.new-template-info {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.new-template-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.new-template-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--pc-text);
}

.new-template-desc {
  font-size: 13px;
  color: var(--pc-text-dim);
  line-height: 1.4;
}
</style>
