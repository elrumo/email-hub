<script setup lang="ts">
/**
 * Right-pane inspector. Shows either the document settings (when nothing is
 * selected) or a form for the selected block's fields. Edits are applied
 * immutably via the doc-ops helpers and bubbled up through the `update:*`
 * events; the parent owns the document state and autosave.
 */
import type { Align, EmailBlock, EmailDocument, EmailTheme, PaddingSide } from '#shared/email/blocks'
import {
  coerceNumberLike,
  findBlock,
  getPaddingSides,
  getUniformPaddingValue,
  isPaddingSides
} from '#shared/email/blocks'
import { duplicateBlock, removeBlock, updateBlock, updateSettings } from '#shared/email/ops'
import { applyThemeToDocument, currentTheme, FONT_STACKS, THEME_PRESETS } from '#shared/email/theme'

const props = defineProps<{
  document: EmailDocument
  selectedId?: string | null
  /** email id — enables the AI subject-line suggester in settings */
  emailId?: string
  /** whether AI features are available to this user (owner only) */
  canAi?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:document', doc: EmailDocument): void
  (e: 'select', id: string | null): void
}>()

const selected = computed<EmailBlock | null>(() =>
  props.selectedId ? findBlock(props.document.blocks, props.selectedId) : null
)

const alignItems = [
  { label: 'Left', value: 'left', icon: 'i-lucide-align-left' },
  { label: 'Center', value: 'center', icon: 'i-lucide-align-center' },
  { label: 'Right', value: 'right', icon: 'i-lucide-align-right' }
] satisfies Array<{ label: string, value: Align, icon: string }>

const paddingItems = [
  { side: 'top', label: 'Top' },
  { side: 'right', label: 'Right' },
  { side: 'bottom', label: 'Bottom' },
  { side: 'left', label: 'Left' }
] satisfies Array<{ side: PaddingSide, label: string }>

function patch(field: string, value: unknown) {
  if (!props.selectedId) return
  emit('update:document', updateBlock(props.document, props.selectedId, { [field]: value }).doc)
}

function patchSettings(field: string, value: unknown) {
  emit('update:document', updateSettings(props.document, { [field]: value }).doc)
}

function patchNumber(field: string, value: unknown, fallback = 0) {
  patch(field, coerceNumberLike(value, fallback))
}

function patchSettingNumber(field: string, value: unknown, fallback = 0) {
  patchSettings(field, coerceNumberLike(value, fallback))
}

function patchPadding(value: unknown) {
  const fallback = getUniformPaddingValue(selected.value?.padding) ?? 0
  patch('padding', coerceNumberLike(value, fallback))
}

function patchPaddingSide(side: PaddingSide, value: unknown) {
  if (!props.selectedId || !selected.value || selected.value.type === 'spacer') return

  const current = getPaddingSides(selected.value.padding)
  emit('update:document', updateBlock(props.document, props.selectedId, {
    padding: {
      ...current,
      [side]: coerceNumberLike(value, current[side])
    }
  }).doc)
}

function removeSelected() {
  if (!props.selectedId) return
  emit('update:document', removeBlock(props.document, props.selectedId).doc)
  emit('select', null)
}

function duplicateSelected() {
  if (!props.selectedId) return
  const res = duplicateBlock(props.document, props.selectedId)
  if (!res.ok) return
  emit('update:document', res.doc)
  if (res.id) emit('select', res.id)
}

// ---- image upload -----------------------------------------------------------
const uploadInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function onUploadPicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (uploadInput.value) uploadInput.value.value = ''
  if (!file || !props.selectedId) return
  if (file.size > 5 * 1024 * 1024) {
    toast.add({ title: 'Images are limited to 5 MB.', color: 'error' })
    return
  }
  uploading.value = true
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const res = await $fetch<{ url: string }>('/api/uploads', {
      method: 'POST',
      body: { name: file.name, contentType: file.type, data }
    })
    patch('src', res.url)
    toast.add({ title: 'Image uploaded', icon: 'i-lucide-image-up', color: 'success' })
  } catch (err: unknown) {
    const e2 = err as { data?: { statusMessage?: string } }
    toast.add({ title: e2?.data?.statusMessage || 'Upload failed.', color: 'error' })
  } finally {
    uploading.value = false
  }
}

const typeLabel: Record<string, string> = {
  heading: 'Heading', text: 'Text', button: 'Button', image: 'Image',
  divider: 'Divider', spacer: 'Spacer', columns: 'Columns', html: 'Custom HTML'
}

// ---- theme designer ---------------------------------------------------------
const theme = computed<EmailTheme>(() => currentTheme(props.document))

const themeTokens = [
  { key: 'brand', label: 'Brand' },
  { key: 'onBrand', label: 'On brand' },
  { key: 'background', label: 'Page' },
  { key: 'surface', label: 'Card' },
  { key: 'heading', label: 'Headings' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted' }
] satisfies Array<{ key: keyof EmailTheme, label: string }>

function patchTheme(patch: Partial<EmailTheme>) {
  emit('update:document', applyThemeToDocument(props.document, patch))
}

function applyPreset(presetId: string) {
  const preset = THEME_PRESETS.find(p => p.id === presetId)
  if (preset) patchTheme({ ...preset.theme })
}

const fontItems = FONT_STACKS.map(f => ({ label: f.label, value: f.value }))

// ---- AI subject line suggestions -------------------------------------------
const toast = useToast()
const suggesting = ref(false)
const suggestions = ref<Array<{ subject: string, preheader: string, angle: string }>>([])

async function suggestSubjects() {
  if (!props.emailId || suggesting.value) return
  suggesting.value = true
  try {
    const res = await $fetch<{ suggestions: typeof suggestions.value }>(`/api/emails/${props.emailId}/subjects`, {
      method: 'POST',
      body: { document: props.document }
    })
    suggestions.value = res.suggestions
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    toast.add({ title: err?.data?.statusMessage || 'Could not get suggestions.', color: 'error' })
  } finally {
    suggesting.value = false
  }
}

function applySuggestion(s: { subject: string, preheader: string }) {
  emit('update:document', updateSettings(props.document, { title: s.subject, preheader: s.preheader }).doc)
}

const paddingPopoverOpen = ref(false)

const hasIndividualPadding = computed(() => (
  !!selected.value
  && isPaddingSides(selected.value.padding)
  && getUniformPaddingValue(selected.value.padding) == null
))

const paddingSummary = computed(() => {
  if (!selected.value) return ''
  const { top, right, bottom, left } = getPaddingSides(selected.value.padding)
  return `Top ${top}px, right ${right}px, bottom ${bottom}px, left ${left}px`
})

watch(() => props.selectedId, () => {
  paddingPopoverOpen.value = false
})
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Block inspector -->
    <template v-if="selected">
      <div class="flex items-center justify-between border-b border-default px-4 py-3">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-square-mouse-pointer"
            class="size-4 text-primary"
          />
          <span class="text-sm font-semibold text-highlighted">{{ typeLabel[selected.type] }}</span>
        </div>
        <div class="flex items-center gap-0.5">
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Duplicate block"
            @click="duplicateSelected"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            aria-label="Delete block"
            @click="removeSelected"
          />
        </div>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-4">
        <!-- Heading -->
        <template v-if="selected.type === 'heading'">
          <UFormField label="Text">
            <UTextarea
              :model-value="selected.text"
              :rows="2"
              class="w-full"
              @update:model-value="patch('text', $event)"
            />
          </UFormField>
          <UFormField label="Level">
            <USelect
              :model-value="selected.level"
              :items="[{ label: 'H1', value: 1 }, { label: 'H2', value: 2 }, { label: 'H3', value: 3 }]"
              class="w-full"
              @update:model-value="patch('level', Number($event))"
            />
          </UFormField>
        </template>

        <!-- Text -->
        <template v-else-if="selected.type === 'text'">
          <UFormField
            label="Content"
            help="Inline HTML allowed: b, i, u, a, br."
          >
            <UTextarea
              :model-value="selected.html"
              :rows="5"
              class="w-full"
              @update:model-value="patch('html', $event)"
            />
          </UFormField>
          <UFormField label="Font size (px)">
            <UInputNumber
              :model-value="selected.fontSize ?? 15"
              class="w-full"
              @update:model-value="patchNumber('fontSize', $event, selected.fontSize ?? 15)"
            />
          </UFormField>
        </template>

        <!-- Button -->
        <template v-else-if="selected.type === 'button'">
          <UFormField label="Label">
            <UInput
              :model-value="selected.label"
              class="w-full"
              @update:model-value="patch('label', $event)"
            />
          </UFormField>
          <UFormField label="Link (href)">
            <UInput
              :model-value="selected.href"
              class="w-full"
              @update:model-value="patch('href', $event)"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Background">
              <UInput
                type="color"
                :model-value="selected.backgroundColor"
                class="w-full"
                @update:model-value="patch('backgroundColor', $event)"
              />
            </UFormField>
            <UFormField label="Text color">
              <UInput
                type="color"
                :model-value="selected.color"
                class="w-full"
                @update:model-value="patch('color', $event)"
              />
            </UFormField>
          </div>
          <UFormField label="Corner radius (px)">
            <UInputNumber
              :model-value="selected.radius ?? 6"
              class="w-full"
              @update:model-value="patchNumber('radius', $event, selected.radius ?? 6)"
            />
          </UFormField>
        </template>

        <!-- Image -->
        <template v-else-if="selected.type === 'image'">
          <UFormField label="Image URL" help="Paste a hosted image URL, or upload one.">
            <div class="space-y-2">
              <UInput
                :model-value="selected.src"
                class="w-full"
                @update:model-value="patch('src', $event)"
              />
              <input
                ref="uploadInput"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                class="hidden"
                @change="onUploadPicked"
              >
              <UButton
                label="Upload image"
                icon="i-lucide-image-up"
                size="xs"
                color="neutral"
                variant="subtle"
                :loading="uploading"
                @click="uploadInput?.click()"
              />
            </div>
          </UFormField>
          <UFormField label="Alt text">
            <UInput
              :model-value="selected.alt"
              class="w-full"
              @update:model-value="patch('alt', $event)"
            />
          </UFormField>
          <UFormField label="Link (optional)">
            <UInput
              :model-value="selected.href ?? ''"
              class="w-full"
              @update:model-value="patch('href', $event)"
            />
          </UFormField>
          <UFormField label="Width (px, 0 = full)">
            <UInputNumber
              :model-value="selected.width ?? 0"
              class="w-full"
              @update:model-value="patchNumber('width', $event, selected.width ?? 0)"
            />
          </UFormField>
        </template>

        <!-- Divider -->
        <template v-else-if="selected.type === 'divider'">
          <UFormField label="Color">
            <UInput
              type="color"
              :model-value="selected.color ?? '#e4e4e7'"
              class="w-full"
              @update:model-value="patch('color', $event)"
            />
          </UFormField>
          <UFormField label="Thickness (px)">
            <UInputNumber
              :model-value="selected.thickness ?? 1"
              class="w-full"
              @update:model-value="patchNumber('thickness', $event, selected.thickness ?? 1)"
            />
          </UFormField>
        </template>

        <!-- Spacer -->
        <template v-else-if="selected.type === 'spacer'">
          <UFormField label="Height (px)">
            <UInputNumber
              :model-value="selected.height"
              class="w-full"
              @update:model-value="patchNumber('height', $event, selected.height)"
            />
          </UFormField>
        </template>

        <!-- Columns -->
        <template v-else-if="selected.type === 'columns'">
          <UFormField label="Gap (px)">
            <UInputNumber
              :model-value="selected.gap ?? 16"
              class="w-full"
              @update:model-value="patchNumber('gap', $event, selected.gap ?? 16)"
            />
          </UFormField>
          <UAlert
            icon="i-lucide-info"
            color="neutral"
            variant="soft"
            title="Column contents"
            description="Ask the AI to add blocks inside columns, e.g. “put an image in the left column and text on the right.”"
          />
        </template>

        <!-- HTML -->
        <template v-else-if="selected.type === 'html'">
          <UFormField
            label="Raw HTML"
            help="Keep it email-safe (tables + inline styles)."
          >
            <UTextarea
              :model-value="selected.html"
              :rows="8"
              class="w-full font-mono text-xs"
              @update:model-value="patch('html', $event)"
            />
          </UFormField>
        </template>

        <!-- Shared: alignment + padding + background (where applicable) -->
        <template v-if="'align' in selected">
          <UFormField label="Alignment">
            <UFieldGroup class="w-full">
              <UButton
                v-for="a in alignItems"
                :key="a.value"
                :icon="a.icon"
                :color="(selected as { align: Align }).align === a.value ? 'primary' : 'neutral'"
                :variant="(selected as { align: Align }).align === a.value ? 'soft' : 'outline'"
                class="flex-1 justify-center"
                @click="patch('align', a.value)"
              />
            </UFieldGroup>
          </UFormField>
        </template>

        <UFormField
          v-if="selected.type !== 'spacer'"
          label="Padding (px)"
        >
          <div class="space-y-2">
            <UFieldGroup class="w-full">
              <UInputNumber
                :model-value="getUniformPaddingValue(selected.padding) ?? undefined"
                class="min-w-0 flex-1"
                @update:model-value="patchPadding($event)"
              />

              <UPopover v-model:open="paddingPopoverOpen">
                <UButton
                  icon="i-lucide-sliders-horizontal"
                  color="neutral"
                  variant="outline"
                  aria-label="Edit individual padding"
                />

                <template #content>
                  <div class="w-80 space-y-3 p-4">
                    <div class="grid grid-cols-2 gap-3">
                      <UFormField
                        v-for="item in paddingItems"
                        :key="item.side"
                        :label="item.label"
                      >
                        <UInputNumber
                          :model-value="getPaddingSides(selected.padding)[item.side]"
                          class="w-full"
                          @update:model-value="patchPaddingSide(item.side, $event)"
                        />
                      </UFormField>
                    </div>
                  </div>
                </template>
              </UPopover>
            </UFieldGroup>

            <p
              v-if="hasIndividualPadding"
              class="text-xs text-muted"
            >
              {{ paddingSummary }}
            </p>
          </div>
        </UFormField>
      </div>
    </template>

    <!-- Document settings (nothing selected) -->
    <template v-else>
      <div class="flex items-center gap-2 border-b border-default px-4 py-3">
        <UIcon
          name="i-lucide-settings-2"
          class="size-4 text-primary"
        />
        <span class="text-sm font-semibold text-highlighted">Email settings</span>
      </div>
      <div class="flex-1 space-y-4 overflow-y-auto p-4">
        <UFormField label="Subject / title">
          <UInput
            :model-value="document.settings.title"
            class="w-full"
            @update:model-value="patchSettings('title', $event)"
          />
        </UFormField>
        <UFormField
          label="Preheader"
          help="Hidden inbox preview text."
        >
          <UInput
            :model-value="document.settings.preheader"
            class="w-full"
            @update:model-value="patchSettings('preheader', $event)"
          />
        </UFormField>

        <!-- AI subject line ideas -->
        <div v-if="canAi && emailId" class="space-y-2">
          <UButton
            :label="suggestions.length ? 'More ideas' : 'Suggest subject & preheader'"
            icon="i-lucide-sparkles"
            size="xs"
            color="primary"
            variant="soft"
            :loading="suggesting"
            @click="suggestSubjects"
          />
          <div v-if="suggestions.length" class="space-y-1.5">
            <button
              v-for="(s, i) in suggestions"
              :key="i"
              type="button"
              class="w-full rounded-lg border border-default p-2.5 text-left transition hover:border-primary/50"
              @click="applySuggestion(s)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="min-w-0 truncate text-xs font-medium text-highlighted">{{ s.subject }}</span>
                <UBadge v-if="s.angle" :label="s.angle" color="neutral" variant="soft" size="sm" class="shrink-0" />
              </div>
              <p class="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted">{{ s.preheader }}</p>
            </button>
            <p class="text-[11px] text-muted">Tap an idea to apply its subject and preheader.</p>
          </div>
        </div>
        <!-- Theme designer -->
        <div class="border-t border-default pt-4">
          <div class="flex items-center gap-2 mb-1">
            <UIcon name="i-lucide-palette" class="size-4 text-primary" />
            <span class="text-sm font-semibold text-highlighted">Theme</span>
          </div>
          <p class="text-xs text-muted mb-3">Restyles colors, font and corners across the whole email — the layout stays put. You can also just ask the AI ("make it feel like autumn").</p>

          <div class="grid grid-cols-2 gap-2 mb-4">
            <button
              v-for="p in THEME_PRESETS"
              :key="p.id"
              type="button"
              class="rounded-lg border border-default p-2 text-left hover:border-primary transition"
              @click="applyPreset(p.id)"
            >
              <div class="flex items-center gap-1 mb-1.5">
                <span class="w-4 h-4 rounded-full border border-black/10" :style="{ backgroundColor: p.theme.brand }" />
                <span class="w-4 h-4 rounded-full border border-black/10" :style="{ backgroundColor: p.theme.background }" />
                <span class="w-4 h-4 rounded-full border border-black/10" :style="{ backgroundColor: p.theme.heading }" />
              </div>
              <div class="text-xs font-medium">{{ p.name }}</div>
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField v-for="t in themeTokens" :key="t.key" :label="t.label">
              <UInput
                type="color"
                :model-value="String(theme[t.key])"
                class="w-full"
                @update:model-value="patchTheme({ [t.key]: $event })"
              />
            </UFormField>
          </div>
          <UFormField label="Font" class="mt-3">
            <USelect
              :model-value="theme.fontFamily"
              :items="fontItems"
              class="w-full"
              @update:model-value="patchTheme({ fontFamily: String($event) })"
            />
          </UFormField>
          <UFormField label="Button corner radius (px)" class="mt-3">
            <UInputNumber
              :model-value="theme.radius"
              class="w-full"
              @update:model-value="patchTheme({ radius: coerceNumberLike($event, theme.radius) })"
            />
          </UFormField>
        </div>

        <UFormField label="Content width (px)">
          <UInputNumber
            :model-value="document.settings.contentWidth"
            class="w-full"
            @update:model-value="patchSettingNumber('contentWidth', $event, document.settings.contentWidth)"
          />
        </UFormField>
        <UAlert
          icon="i-lucide-mouse-pointer-click"
          color="neutral"
          variant="soft"
          title="Tip"
          description="Click any block in the preview to edit it here, or ask the AI to change it."
        />
      </div>
    </template>
  </div>
</template>
