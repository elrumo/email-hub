<script setup lang="ts">
/**
 * A section heading band — a chrome-less, full-width title used to group tiles
 * on the bento grid. A `@container`, so the heading scales with the band's
 * actual rendered width (container-query variants). Takes the same `size` prop
 * as the other widget cards for a consistent contract (it's container-driven).
 */
defineProps<{
  /** the heading text (Widget.content) */
  title?: string | null
  /** present for a uniform card contract; sizing is container-driven */
  size?: 'list' | 'sm' | 'lg'
}>()
</script>

<template>
  <div class="@container flex h-full items-center gap-3">
    <h2 class="shrink-0 text-base font-semibold tracking-tight text-highlighted @md:text-lg @lg:text-xl">
      {{ title || 'Section' }}
    </h2>
    <span class="h-px flex-1 bg-default" />
  </div>
</template>
