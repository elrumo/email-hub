<script setup lang="ts">
import { isRichTextHtml } from '~/composables/bento'

/**
 * A note tile — author-owned rich text (from the Nuxt UI editor) or plain text.
 * Renders bare (no `UCard`); the parent provides the card chrome. The body is a
 * `@container`, so the type scale grows with the tile's actual rendered width
 * (container-query variants) rather than snapping at a coarse `size` bucket.
 */
const { content } = defineProps<{
  /** the note body — HTML from the editor or plain text (Widget.content) */
  content?: string | null
  /** kept for a uniform card contract; sizing is container-driven */
  size?: 'list' | 'sm' | 'lg'
}>()

const isHtml = computed(() => isRichTextHtml(content))
</script>

<template>
  <div class="@container h-full">
    <!-- eslint-disable vue/no-v-html -- author-owned content from the Nuxt UI editor -->
    <div
      v-if="isHtml"
      class="bento-richtext h-full overflow-auto text-sm @sm:text-base @lg:text-lg"
      v-html="content"
    />
    <!-- eslint-enable vue/no-v-html -->
    <p
      v-else
      class="h-full overflow-auto whitespace-pre-wrap text-muted text-sm @sm:text-base @lg:text-lg"
    >
      {{ content || 'Empty note' }}
    </p>
  </div>
</template>
