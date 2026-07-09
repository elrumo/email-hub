<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Email tools — Postcard' })

// ── Tabs ─────────────────────────────────────────────────────────────────
const activeTab = ref<'check' | 'lookup' | 'preview'>('check')

// ── Can I Email data ─────────────────────────────────────────────────────
interface CaniemailFeature {
  slug: string
  title: string
  description: string | null
  url: string
  category: string
  tags: string[]
  keywords: string
  stats: Record<string, Record<string, Record<string, string>>>
  notes: string | null
  notes_by_num: Record<string, string> | null
}

interface CaniemailData {
  data: CaniemailFeature[]
  nicenames: {
    family: Record<string, string>
    platform: Record<string, string>
    support: Record<string, string>
    category: Record<string, string>
  }
}

const { data: caniemailData } = await useFetch<CaniemailData>('/api/caniemail')

// ── Compliance Checker ───────────────────────────────────────────────────
const checkHtml = ref('')
const checkResults = ref<Array<{ type: 'error' | 'warning' | 'info', message: string, feature?: string, url?: string }>>([])
const checkScore = ref<number | null>(null)
const checkFileInput = ref<HTMLInputElement | null>(null)

interface ComplianceRule {
  pattern: RegExp
  type: 'css-property' | 'html-element' | 'html-attribute' | 'css-value'
  category: string
  message: string
  caniemailSlug?: string
}

const complianceRules: ComplianceRule[] = [
  // CSS properties that are problematic in email
  { pattern: /display\s*:\s*flex/gi, type: 'css-property', category: 'CSS Layout', message: '`display: flex` is not supported in Outlook (Windows) and many webmail clients.', caniemailSlug: 'css-display' },
  { pattern: /display\s*:\s*grid/gi, type: 'css-property', category: 'CSS Layout', message: '`display: grid` has very limited support in email clients.', caniemailSlug: 'css-display' },
  { pattern: /display\s*:\s*(inline-flex|inline-grid)/gi, type: 'css-property', category: 'CSS Layout', message: '`inline-flex` / `inline-grid` have limited email support.', caniemailSlug: 'css-display' },
  { pattern: /position\s*:\s*(absolute|relative|fixed|sticky)/gi, type: 'css-property', category: 'CSS Layout', message: 'CSS positioning is not supported in Outlook (Windows).', caniemailSlug: 'css-position' },
  { pattern: /float\s*:/gi, type: 'css-property', category: 'CSS Layout', message: '`float` has inconsistent support across email clients.', caniemailSlug: 'css-float' },
  { pattern: /gap\s*:/gi, type: 'css-property', category: 'CSS Layout', message: '`gap` is only supported when combined with flex/grid, which have limited support.', caniemailSlug: 'css-gap' },
  { pattern: /flex-direction|flex-wrap|justify-content|align-items|align-self|flex-grow|flex-shrink|flex-basis/gi, type: 'css-property', category: 'CSS Flexbox', message: 'Flexbox properties are not supported in Outlook (Windows) or Gmail.', caniemailSlug: 'css-display' },
  { pattern: /grid-template|grid-column|grid-row|grid-area/gi, type: 'css-property', category: 'CSS Grid', message: 'CSS Grid is not supported in most email clients.', caniemailSlug: 'css-display' },
  { pattern: /transform\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`transform` has very limited support in email clients.', caniemailSlug: 'css-transform' },
  { pattern: /transition\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`transition` is not supported in Outlook or Gmail.', caniemailSlug: 'css-transition' },
  { pattern: /animation\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`animation` / `@keyframes` are not supported in Outlook or Gmail.', caniemailSlug: 'css-animation' },
  { pattern: /@keyframes/gi, type: 'css-property', category: 'CSS Effects', message: '`@keyframes` are not supported in Outlook or Gmail.', caniemailSlug: 'css-at-keyframes' },
  { pattern: /box-shadow\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`box-shadow` is not supported in Outlook (Windows).', caniemailSlug: 'css-box-shadow' },
  { pattern: /text-shadow\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`text-shadow` is not supported in Outlook (Windows).', caniemailSlug: 'css-text-shadow' },
  { pattern: /border-radius\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`border-radius` is not supported in Outlook (Windows).', caniemailSlug: 'css-border-radius' },
  { pattern: /opacity\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`opacity` has inconsistent support in older Outlook versions.', caniemailSlug: 'css-opacity' },
  { pattern: /background-blend-mode/gi, type: 'css-property', category: 'CSS Effects', message: '`background-blend-mode` is not supported in Gmail or Yahoo.', caniemailSlug: 'css-background-blend-mode' },
  { pattern: /backdrop-filter/gi, type: 'css-property', category: 'CSS Effects', message: '`backdrop-filter` is not supported in Gmail or Outlook.', caniemailSlug: 'css-backdrop-filter' },
  { pattern: /filter\s*:\s*(?!.*background)/gi, type: 'css-property', category: 'CSS Effects', message: 'CSS `filter` has very limited email support.', caniemailSlug: 'css-filter' },
  { pattern: /@font-face/gi, type: 'css-property', category: 'CSS Typography', message: '`@font-face` is not supported in Gmail or Outlook (Windows).', caniemailSlug: 'css-at-font-face' },
  { pattern: /object-fit\s*:/gi, type: 'css-property', category: 'CSS Images', message: '`object-fit` is not supported in Outlook or Gmail.', caniemailSlug: 'css-object-fit' },
  { pattern: /clip-path\s*:/gi, type: 'css-property', category: 'CSS Effects', message: '`clip-path` is not supported in Outlook or Gmail.', caniemailSlug: 'css-clip-path' },
  { pattern: /mix-blend-mode/gi, type: 'css-property', category: 'CSS Effects', message: '`mix-blend-mode` is not supported in most email clients.', caniemailSlug: 'css-mix-blend-mode' },
  { pattern: /aspect-ratio\s*:/gi, type: 'css-property', category: 'CSS Layout', message: '`aspect-ratio` is not supported in Gmail, Outlook, or Yahoo.', caniemailSlug: 'css-aspect-ratio' },
  { pattern: /accent-color\s*:/gi, type: 'css-property', category: 'CSS Forms', message: '`accent-color` is not supported in Gmail, Outlook, or Yahoo.', caniemailSlug: 'css-accent-color' },
  { pattern: /:has\(/gi, type: 'css-property', category: 'CSS Selectors', message: '`:has()` selector is not supported in most email clients.', caniemailSlug: 'css-selector-has' },
  { pattern: /:is\(/gi, type: 'css-property', category: 'CSS Selectors', message: '`:is()` selector has limited email support.', caniemailSlug: 'css-selector-is' },
  { pattern: /:where\(/gi, type: 'css-property', category: 'CSS Selectors', message: '`:where()` selector has limited email support.', caniemailSlug: 'css-selector-where' },
  { pattern: /@supports/gi, type: 'css-property', category: 'CSS At-Rules', message: '`@supports` is not supported in Gmail or Outlook.', caniemailSlug: 'css-at-supports' },
  { pattern: /@media\s*\(\s*prefers-color-scheme/gi, type: 'css-property', category: 'CSS Media Queries', message: '`prefers-color-scheme` is not supported in Gmail or Outlook (Windows).', caniemailSlug: 'css-at-media-prefers-color-scheme' },
  { pattern: /@import/gi, type: 'css-property', category: 'CSS At-Rules', message: '`@import` is not supported in Gmail, Yahoo, or AOL.', caniemailSlug: 'css-at-import' },
  // HTML elements
  { pattern: /<video[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<video>` is not supported in Outlook (Windows) or Gmail.', caniemailSlug: 'html-video' },
  { pattern: /<audio[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<audio>` is not supported in most email clients.', caniemailSlug: 'html-audio' },
  { pattern: /<iframe[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<iframe>` is stripped by most email clients.', caniemailSlug: 'html-iframe' },
  { pattern: /<form[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<form>` is not supported in most email clients.', caniemailSlug: 'html-form' },
  { pattern: /<input[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<input>` has very limited email support.', caniemailSlug: 'html-input' },
  { pattern: /<canvas[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<canvas>` is not supported in email clients.', caniemailSlug: 'html-canvas' },
  { pattern: /<svg[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<svg>` has limited support — Outlook (Windows) does not render it.', caniemailSlug: 'html-svg' },
  { pattern: /<picture[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<picture>` is not supported in Outlook or Gmail.', caniemailSlug: 'html-picture' },
  { pattern: /<template[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<template>` is not supported in email clients.', caniemailSlug: 'html-template' },
  { pattern: /<details[\s>]|<summary[\s>]/gi, type: 'html-element', category: 'HTML Elements', message: '`<details>` / `<summary>` are not supported in Outlook or Gmail.', caniemailSlug: 'html-details' },
  // HTML attributes
  { pattern: /background="[^"]*"/gi, type: 'html-attribute', category: 'HTML Attributes', message: 'The `background` attribute on `<table>` is deprecated; use inline `style` instead.', caniemailSlug: 'html-background-attribute' },
  { pattern: /<img[^>]*loading=/gi, type: 'html-attribute', category: 'HTML Attributes', message: 'The `loading` attribute on `<img>` is not supported in email clients.', caniemailSlug: 'html-img-loading' },
  { pattern: /<img[^>]*srcset=/gi, type: 'html-attribute', category: 'HTML Attributes', message: '`srcset` on `<img>` is not supported in Outlook or Gmail.', caniemailSlug: 'html-img-srcset' },
  { pattern: /<a[^>]*target="_blank"[^>]*rel="(?!noopener)/gi, type: 'html-attribute', category: 'HTML Attributes', message: 'Links with `target="_blank"` should include `rel="noopener"` for security.' },
  // CSS values
  { pattern: /background\s*:\s*linear-gradient/gi, type: 'css-value', category: 'CSS Backgrounds', message: '`linear-gradient` is not supported in Outlook (Windows).', caniemailSlug: 'css-background-image' },
  { pattern: /background\s*:\s*radial-gradient/gi, type: 'css-value', category: 'CSS Backgrounds', message: '`radial-gradient` is not supported in Outlook (Windows).', caniemailSlug: 'css-background-image' },
  { pattern: /background\s*:\s*url\s*\(\s*data:/gi, type: 'css-value', category: 'CSS Backgrounds', message: 'Data URIs in background images are not supported in Outlook (Windows).', caniemailSlug: 'css-background-image' },
  { pattern: /var\s*\(\s*--/gi, type: 'css-value', category: 'CSS Variables', message: 'CSS custom properties (`var()`) are not supported in Outlook or Gmail.', caniemailSlug: 'css-custom-properties' },
  { pattern: /calc\s*\(/gi, type: 'css-value', category: 'CSS Functions', message: '`calc()` has limited support in Outlook (Windows).', caniemailSlug: 'css-calc' },
  { pattern: /min\s*\(|max\s*\(/gi, type: 'css-value', category: 'CSS Functions', message: '`min()` / `max()` are not supported in Outlook (Windows).', caniemailSlug: 'css-min-max' },
  { pattern: /clamp\s*\(/gi, type: 'css-value', category: 'CSS Functions', message: '`clamp()` is not supported in Outlook (Windows).', caniemailSlug: 'css-clamp' },
]

function runComplianceCheck() {
  checkResults.value = []
  if (!checkHtml.value.trim()) return

  const seen = new Set<string>()
  const html = checkHtml.value

  for (const rule of complianceRules) {
    const matches = html.match(rule.pattern)
    if (matches) {
      const key = rule.message
      if (!seen.has(key)) {
        seen.add(key)
        checkResults.value.push({
          type: rule.type === 'css-property' || rule.type === 'css-value' ? 'warning' : 'warning',
          message: rule.message,
          feature: rule.caniemailSlug,
          url: rule.caniemailSlug ? `https://www.caniemail.com/features/${rule.caniemailSlug}/` : undefined
        })
      }
    }
  }

  // Basic structural checks
  if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) {
    checkResults.value.push({ type: 'info', message: 'No `<html>` or `<body>` wrapper found. Some clients may not render correctly.' })
  }
  if (!/<meta[^>]*charset/i.test(html)) {
    checkResults.value.push({ type: 'warning', message: 'Missing `<meta charset>` declaration. Add `<meta charset="utf-8">` for best compatibility.' })
  }
  if (!/<meta[^>]*viewport/i.test(html)) {
    checkResults.value.push({ type: 'info', message: 'No `<meta name="viewport">` tag found. Consider adding one for mobile responsiveness.' })
  }
  if (/<style[\s>]/i.test(html) && !/<head[\s>]/i.test(html)) {
    checkResults.value.push({ type: 'warning', message: 'Found `<style>` tag outside of `<head>`. Some email clients strip styles not in `<head>`.' })
  }
  if (/<!DOCTYPE/i.test(html) === false) {
    checkResults.value.push({ type: 'info', message: 'Missing `<!DOCTYPE html>` declaration.' })
  }

  // Score: 100 minus penalties
  const errors = checkResults.value.filter(r => r.type === 'error').length
  const warnings = checkResults.value.filter(r => r.type === 'warning').length
  checkScore.value = Math.max(0, 100 - (errors * 15) - (warnings * 5))
}

function onCheckFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  const reader = new FileReader()
  reader.onload = () => { checkHtml.value = reader.result as string }
  reader.readAsText(file)
}

// ── Can I Email Lookup ───────────────────────────────────────────────────
const lookupQuery = ref('')
const lookupResults = ref<CaniemailFeature[]>([])

function runLookup() {
  const q = lookupQuery.value.toLowerCase().trim()
  if (!q || !caniemailData.value) {
    lookupResults.value = []
    return
  }
  lookupResults.value = caniemailData.value.data.filter(f =>
    f.title.toLowerCase().includes(q) ||
    f.slug.toLowerCase().includes(q) ||
    (f.keywords || '').toLowerCase().includes(q) ||
    (f.description || '').toLowerCase().includes(q)
  ).slice(0, 20)
}

function lookupSupportLevel(feature: CaniemailFeature, family: string): string {
  const familyStats = feature.stats[family]
  if (!familyStats) return 'u'
  // Get the latest version's support level
  for (const platform of Object.values(familyStats)) {
    const versions = Object.keys(platform)
    if (versions.length) {
      const latest = versions[versions.length - 1]
      return platform[latest]
    }
  }
  return 'u'
}

const mainClients = ['apple-mail', 'gmail', 'outlook', 'yahoo', 'samsung-email', 'thunderbird']

// ── HTML Preview ─────────────────────────────────────────────────────────
const previewHtml = ref('')
const previewFrame = ref<HTMLIFrameElement | null>(null)
const previewFileInput = ref<HTMLInputElement | null>(null)
const previewDevice = ref<'desktop' | 'mobile'>('desktop')

function updatePreview() {
  if (previewFrame.value) {
    previewFrame.value.srcdoc = previewHtml.value
  }
}

function onPreviewFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  const reader = new FileReader()
  reader.onload = () => {
    previewHtml.value = reader.result as string
    nextTick(updatePreview)
  }
  reader.readAsText(file)
}

watch(previewHtml, () => nextTick(updatePreview))

function downloadPreview() {
  const blob = new Blob([previewHtml.value], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'email-preview.html'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="tools-page">
    <!-- Header -->
    <div class="tools-header pc-rise">
      <h1 class="tools-title">Email tools</h1>
      <p class="tools-sub">Check compatibility, look up support, and preview your HTML emails.</p>
    </div>

    <!-- Tabs -->
    <div class="tools-tabs pc-rise-2">
      <button class="tools-tab" :class="activeTab === 'check' && 'tools-tab--active'" @click="activeTab = 'check'">
        <UIcon name="i-lucide-shield-check" class="w-4 h-4" />
        Compliance checker
      </button>
      <button class="tools-tab" :class="activeTab === 'lookup' && 'tools-tab--active'" @click="activeTab = 'lookup'">
        <UIcon name="i-lucide-search" class="w-4 h-4" />
        Can I Email?
      </button>
      <button class="tools-tab" :class="activeTab === 'preview' && 'tools-tab--active'" @click="activeTab = 'preview'">
        <UIcon name="i-lucide-eye" class="w-4 h-4" />
        HTML preview
      </button>
    </div>

    <!-- Compliance Checker -->
    <div v-if="activeTab === 'check'" class="tools-content pc-rise-2">
      <div class="check-layout">
        <!-- Input -->
        <div class="check-input-area">
          <div class="check-input-header">
            <span class="check-input-label">HTML source</span>
            <button class="check-upload-btn" @click="checkFileInput?.click()">
              <UIcon name="i-lucide-upload" class="w-3.5 h-3.5" />
              Upload file
            </button>
            <input ref="checkFileInput" type="file" accept=".html,.htm,.txt" class="hidden" @change="onCheckFileUpload" />
          </div>
          <textarea
            v-model="checkHtml"
            class="check-textarea"
            placeholder="Paste your HTML email code here, or upload a file..."
            spellcheck="false"
          />
          <button class="check-run-btn" :disabled="!checkHtml.trim()" @click="runComplianceCheck">
            <UIcon name="i-lucide-play" class="w-4 h-4" />
            Run compliance check
          </button>
        </div>

        <!-- Results -->
        <div class="check-results-area">
          <div v-if="checkScore !== null" class="check-score-card">
            <div class="check-score-ring" :class="checkScore >= 80 ? 'check-score-ring--good' : checkScore >= 50 ? 'check-score-ring--warn' : 'check-score-ring--bad'">
              <span class="check-score-num">{{ checkScore }}</span>
            </div>
            <div class="check-score-label">
              {{ checkScore >= 80 ? 'Good compatibility' : checkScore >= 50 ? 'Moderate issues' : 'Many issues found' }}
            </div>
          </div>

          <div v-if="checkResults.length" class="check-results-list">
            <div
              v-for="(r, i) in checkResults"
              :key="i"
              class="check-result-item"
            >
              <div class="check-result-icon" :class="r.type === 'error' ? 'check-result-icon--error' : r.type === 'warning' ? 'check-result-icon--warn' : 'check-result-icon--info'">
                <UIcon :name="r.type === 'error' ? 'i-lucide-x-circle' : r.type === 'warning' ? 'i-lucide-alert-triangle' : 'i-lucide-info'" class="w-4 h-4" />
              </div>
              <div class="check-result-body">
                <div class="check-result-msg" v-html="r.message.replace(/`([^`]+)`/g, '<code>$1</code>')" />
                <a v-if="r.url" :href="r.url" target="_blank" rel="noopener" class="check-result-link">
                  View on caniemail.com
                  <UIcon name="i-lucide-external-link" class="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <div v-else-if="checkScore !== null" class="check-empty">
            <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-green-500" />
            <p>No issues found! Your HTML looks email-safe.</p>
          </div>

          <div v-else class="check-empty">
            <UIcon name="i-lucide-shield-check" class="w-8 h-8" />
            <p>Paste HTML or upload a file to check compatibility.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Can I Email Lookup -->
    <div v-if="activeTab === 'lookup'" class="tools-content pc-rise-2">
      <div class="lookup-search">
        <UIcon name="i-lucide-search" class="lookup-search-icon" />
        <input
          v-model="lookupQuery"
          class="lookup-search-input"
          placeholder="Search CSS properties, HTML elements, or attributes… (e.g. flexbox, video, border-radius)"
          @input="runLookup"
        />
      </div>

      <div v-if="lookupResults.length" class="lookup-results">
        <div v-for="feature in lookupResults" :key="feature.slug" class="lookup-card">
          <div class="lookup-card-header">
            <div>
              <span class="lookup-card-title">{{ feature.title }}</span>
              <span class="lookup-card-cat">{{ feature.category }}</span>
            </div>
            <a :href="feature.url" target="_blank" rel="noopener" class="lookup-card-link">
              caniemail.com
              <UIcon name="i-lucide-external-link" class="w-3 h-3" />
            </a>
          </div>
          <p v-if="feature.description" class="lookup-card-desc">{{ feature.description }}</p>
          <div class="lookup-support-grid">
            <div v-for="client in mainClients" :key="client" class="lookup-support-cell">
              <span class="lookup-client-name">{{ caniemailData?.nicenames.family[client] || client }}</span>
              <span
                class="lookup-support-badge"
                :class="{
                  'lookup-support-badge--y': lookupSupportLevel(feature, client) === 'y',
                  'lookup-support-badge--n': lookupSupportLevel(feature, client) === 'n',
                  'lookup-support-badge--a': lookupSupportLevel(feature, client) === 'a',
                  'lookup-support-badge--u': lookupSupportLevel(feature, client) === 'u',
                }"
                :title="lookupSupportLevel(feature, client) === 'y' ? 'Supported' : lookupSupportLevel(feature, client) === 'n' ? 'Not supported' : lookupSupportLevel(feature, client) === 'a' ? 'Partial support' : 'Unknown'"
              >
                {{ lookupSupportLevel(feature, client) === 'y' ? 'Yes' : lookupSupportLevel(feature, client) === 'n' ? 'No' : lookupSupportLevel(feature, client) === 'a' ? 'Partial' : '?' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="lookupQuery" class="lookup-empty">
        <p>No features match "{{ lookupQuery }}".</p>
      </div>

      <div v-else class="lookup-empty">
        <UIcon name="i-lucide-search" class="w-8 h-8" />
        <p>Search for any CSS property, HTML element, or attribute to see its email client support.</p>
        <p class="lookup-empty-hint">Powered by <a href="https://www.caniemail.com/" target="_blank" rel="noopener">caniemail.com</a></p>
      </div>
    </div>

    <!-- HTML Preview -->
    <div v-if="activeTab === 'preview'" class="tools-content pc-rise-2">
      <div class="preview-layout">
        <div class="preview-controls">
          <div class="preview-ctrl-left">
            <button class="preview-upload-btn" @click="previewFileInput?.click()">
              <UIcon name="i-lucide-upload" class="w-3.5 h-3.5" />
              Upload HTML
            </button>
            <input ref="previewFileInput" type="file" accept=".html,.htm,.txt" class="hidden" @change="onPreviewFileUpload" />
            <button class="preview-ctrl-btn" :disabled="!previewHtml" @click="downloadPreview">
              <UIcon name="i-lucide-download" class="w-3.5 h-3.5" />
              Download
            </button>
            <button class="preview-ctrl-btn" :disabled="!previewHtml" @click="previewHtml = ''">
              <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
          <div class="preview-device-toggle">
            <button
              class="preview-device-btn"
              :class="previewDevice === 'desktop' && 'preview-device-btn--active'"
              @click="previewDevice = 'desktop'"
            >
              <UIcon name="i-lucide-monitor" class="w-4 h-4" />
            </button>
            <button
              class="preview-device-btn"
              :class="previewDevice === 'mobile' && 'preview-device-btn--active'"
              @click="previewDevice = 'mobile'"
            >
              <UIcon name="i-lucide-smartphone" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="preview-main">
          <!-- Source editor -->
          <div class="preview-source">
            <textarea
              v-model="previewHtml"
              class="preview-textarea"
              placeholder="Paste your HTML email code here, or upload a file..."
              spellcheck="false"
            />
          </div>
          <!-- Preview iframe -->
          <div class="preview-frame-wrap" :class="previewDevice === 'mobile' && 'preview-frame-wrap--mobile'">
            <div class="preview-frame-chrome">
              <div class="preview-frame-dot" />
              <div class="preview-frame-dot" />
              <div class="preview-frame-dot" />
            </div>
            <iframe
              ref="previewFrame"
              class="preview-frame"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tools-page {
  padding: 32px 40px;
  max-width: 1200px;
  margin: 0 auto;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.tools-header {
  margin-bottom: 24px;
}

.tools-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--pc-text);
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}

.tools-sub {
  font-size: 14px;
  color: var(--pc-text-dim);
  margin: 0;
}

/* ── Tabs ──────────────────────────────────────────────────────────────── */
.tools-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--pc-border);
  margin-bottom: 24px;
}

.tools-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text-dim);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
  font-family: inherit;
  margin-bottom: -1px;
}

.tools-tab:hover {
  color: var(--pc-text);
}

.tools-tab--active {
  color: var(--pc-text);
  border-bottom-color: var(--pc-text);
}

/* ── Compliance Checker ────────────────────────────────────────────────── */
.check-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  min-height: 500px;
}

@media (max-width: 900px) {
  .check-layout {
    grid-template-columns: 1fr;
  }
}

.check-input-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.check-input-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.check-input-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--pc-text);
  flex: 1;
}

.check-upload-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--pc-text-dim);
  background: transparent;
  border: 1px solid var(--pc-border);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
}

.check-upload-btn:hover {
  background: var(--pc-hover);
}

.check-textarea {
  flex: 1;
  min-height: 300px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--pc-border);
  background: var(--pc-window-solid);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--pc-text);
  resize: vertical;
  outline: none;
}

.check-textarea::placeholder {
  color: var(--pc-text-muted);
}

.check-run-btn {
  display: flex;
  align-items: center;
  justify-content: center;
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

.check-run-btn:hover { opacity: 0.85; }
.check-run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.check-results-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  max-height: 500px;
  padding-right: 4px;
}

.check-score-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 10px;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
}

.check-score-ring {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
}

.check-score-ring--good { background: rgba(34,197,94,0.1); color: #22c55e; }
.check-score-ring--warn { background: rgba(245,158,11,0.1); color: #f59e0b; }
.check-score-ring--bad { background: rgba(239,68,68,0.1); color: #ef4444; }

.check-score-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--pc-text);
}

.check-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-result-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
}

.check-result-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.check-result-icon--error { background: rgba(239,68,68,0.1); color: #ef4444; }
.check-result-icon--warn { background: rgba(245,158,11,0.1); color: #f59e0b; }
.check-result-icon--info { background: rgba(59,130,246,0.1); color: #3b82f6; }

.check-result-body {
  min-width: 0;
}

.check-result-msg {
  font-size: 13px;
  color: var(--pc-text);
  line-height: 1.5;
}

.check-result-msg :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--pc-surface);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.check-result-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--pc-text-dim);
  text-decoration: none;
}

.check-result-link:hover { color: var(--pc-text); }

.check-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  color: var(--pc-text-muted);
  gap: 10px;
}

.check-empty p { font-size: 14px; color: var(--pc-text-dim); margin: 0; }

/* ── Lookup ────────────────────────────────────────────────────────────── */
.lookup-search {
  position: relative;
  margin-bottom: 20px;
}

.lookup-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--pc-text-muted);
  pointer-events: none;
}

.lookup-search-input {
  width: 100%;
  padding: 10px 14px 10px 36px;
  border-radius: 10px;
  border: 1px solid var(--pc-border);
  background: var(--pc-window-solid);
  font-size: 14px;
  color: var(--pc-text);
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.lookup-search-input::placeholder { color: var(--pc-text-muted); }
.lookup-search-input:focus { border-color: var(--pc-border-strong); }

.lookup-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lookup-card {
  padding: 16px;
  border-radius: 10px;
  background: var(--pc-window-solid);
  border: 1px solid var(--pc-border);
}

.lookup-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.lookup-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--pc-text);
}

.lookup-card-cat {
  margin-left: 8px;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: var(--pc-surface);
  color: var(--pc-text-dim);
}

.lookup-card-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--pc-text-dim);
  text-decoration: none;
  white-space: nowrap;
}

.lookup-card-link:hover { color: var(--pc-text); }

.lookup-card-desc {
  font-size: 13px;
  color: var(--pc-text-dim);
  margin: 6px 0 10px;
  line-height: 1.4;
}

.lookup-support-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lookup-support-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--pc-surface);
}

.lookup-client-name {
  font-size: 11px;
  color: var(--pc-text-dim);
}

.lookup-support-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
}

.lookup-support-badge--y { background: rgba(34,197,94,0.15); color: #22c55e; }
.lookup-support-badge--n { background: rgba(239,68,68,0.15); color: #ef4444; }
.lookup-support-badge--a { background: rgba(245,158,11,0.15); color: #f59e0b; }
.lookup-support-badge--u { background: var(--pc-hover); color: var(--pc-text-muted); }

.lookup-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
  color: var(--pc-text-muted);
  gap: 10px;
}

.lookup-empty p { font-size: 14px; color: var(--pc-text-dim); margin: 0; }
.lookup-empty-hint { font-size: 12px; color: var(--pc-text-muted); }
.lookup-empty-hint a { color: var(--pc-text-dim); }

/* ── Preview ───────────────────────────────────────────────────────────── */
.preview-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.preview-ctrl-left {
  display: flex;
  gap: 8px;
}

.preview-upload-btn,
.preview-ctrl-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--pc-text-dim);
  background: transparent;
  border: 1px solid var(--pc-border);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
}

.preview-upload-btn:hover,
.preview-ctrl-btn:hover { background: var(--pc-hover); }
.preview-ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.preview-device-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--pc-surface);
}

.preview-device-btn {
  width: 32px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--pc-text-dim);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.preview-device-btn--active {
  background: var(--pc-window-solid);
  color: var(--pc-text);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

.preview-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 500px;
}

@media (max-width: 900px) {
  .preview-main {
    grid-template-columns: 1fr;
  }
}

.preview-source {
  display: flex;
}

.preview-textarea {
  flex: 1;
  min-height: 500px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--pc-border);
  background: var(--pc-window-solid);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--pc-text);
  resize: vertical;
  outline: none;
}

.preview-textarea::placeholder { color: var(--pc-text-muted); }

.preview-frame-wrap {
  border-radius: 10px;
  border: 1px solid var(--pc-border);
  overflow: hidden;
  background: #ffffff;
  max-width: 100%;
}

.preview-frame-wrap--mobile {
  max-width: 375px;
  margin: 0 auto;
}

.preview-frame-chrome {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  background: var(--pc-surface);
  border-bottom: 1px solid var(--pc-border);
}

.preview-frame-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pc-border-strong);
}

.preview-frame {
  width: 100%;
  min-height: 472px;
  border: none;
  display: block;
}
</style>
