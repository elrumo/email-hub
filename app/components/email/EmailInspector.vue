<script setup lang="ts">
/**
 * Right-pane inspector. Shows either the document settings (when nothing is
 * selected) or a form for the selected block's fields. Edits are applied
 * immutably via the doc-ops helpers and bubbled up through the `update:*`
 * events; the parent owns the document state and autosave.
 */
import type { Align, EmailBlock, EmailDocument } from '#shared/email/blocks'
import { findBlock } from '#shared/email/blocks'
import { removeBlock, updateBlock, updateSettings } from '#shared/email/ops'

const props = defineProps<{
  document: EmailDocument
  selectedId?: string | null
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

function patch(field: string, value: unknown) {
  if (!props.selectedId) return
  emit('update:document', updateBlock(props.document, props.selectedId, { [field]: value }).doc)
}

function patchSettings(field: string, value: unknown) {
  emit('update:document', updateSettings(props.document, { [field]: value }).doc)
}

function removeSelected() {
  if (!props.selectedId) return
  emit('update:document', removeBlock(props.document, props.selectedId).doc)
  emit('select', null)
}

const typeLabel: Record<string, string> = {
  heading: 'Heading', text: 'Text', button: 'Button', image: 'Image',
  divider: 'Divider', spacer: 'Spacer', columns: 'Columns', html: 'Custom HTML'
}
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
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="Delete block"
          @click="removeSelected"
        />
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
              @update:model-value="patch('fontSize', $event)"
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
              @update:model-value="patch('radius', $event)"
            />
          </UFormField>
        </template>

        <!-- Image -->
        <template v-else-if="selected.type === 'image'">
          <UFormField label="Image URL">
            <UInput
              :model-value="selected.src"
              class="w-full"
              @update:model-value="patch('src', $event)"
            />
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
              @update:model-value="patch('width', $event)"
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
              @update:model-value="patch('thickness', $event)"
            />
          </UFormField>
        </template>

        <!-- Spacer -->
        <template v-else-if="selected.type === 'spacer'">
          <UFormField label="Height (px)">
            <UInputNumber
              :model-value="selected.height"
              class="w-full"
              @update:model-value="patch('height', $event)"
            />
          </UFormField>
        </template>

        <!-- Columns -->
        <template v-else-if="selected.type === 'columns'">
          <UFormField label="Gap (px)">
            <UInputNumber
              :model-value="selected.gap ?? 16"
              class="w-full"
              @update:model-value="patch('gap', $event)"
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
            <UButtonGroup class="w-full">
              <UButton
                v-for="a in alignItems"
                :key="a.value"
                :icon="a.icon"
                :color="(selected as { align: Align }).align === a.value ? 'primary' : 'neutral'"
                :variant="(selected as { align: Align }).align === a.value ? 'soft' : 'outline'"
                class="flex-1 justify-center"
                @click="patch('align', a.value)"
              />
            </UButtonGroup>
          </UFormField>
        </template>

        <UFormField
          v-if="selected.type !== 'spacer'"
          label="Padding (px)"
        >
          <UInputNumber
            :model-value="selected.padding ?? 0"
            class="w-full"
            @update:model-value="patch('padding', $event)"
          />
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
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Page background">
            <UInput
              type="color"
              :model-value="document.settings.backgroundColor"
              class="w-full"
              @update:model-value="patchSettings('backgroundColor', $event)"
            />
          </UFormField>
          <UFormField label="Card background">
            <UInput
              type="color"
              :model-value="document.settings.contentBackground"
              class="w-full"
              @update:model-value="patchSettings('contentBackground', $event)"
            />
          </UFormField>
        </div>
        <UFormField label="Text color">
          <UInput
            type="color"
            :model-value="document.settings.textColor"
            class="w-full"
            @update:model-value="patchSettings('textColor', $event)"
          />
        </UFormField>
        <UFormField label="Content width (px)">
          <UInputNumber
            :model-value="document.settings.contentWidth"
            class="w-full"
            @update:model-value="patchSettings('contentWidth', $event)"
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
