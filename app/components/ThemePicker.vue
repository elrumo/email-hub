<script setup lang="ts">
// Switches the app's accent palette at runtime via the reactive Nuxt UI app
// config (see useTheme). Complements UColorModeButton, which toggles light/dark.
const { themePresets, themeId, setTheme } = useTheme()
</script>

<template>
  <UPopover :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-palette"
      color="neutral"
      variant="ghost"
      aria-label="Theme"
    />

    <template #content>
      <div class="w-44 p-2">
        <p class="px-2 pb-1.5 pt-1 text-xs font-medium text-muted">
          Theme
        </p>
        <button
          v-for="preset in themePresets"
          :key="preset.id"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-elevated"
          :class="themeId === preset.id ? 'text-highlighted' : 'text-default'"
          @click="setTheme(preset.id)"
        >
          <span
            class="size-4 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
            :style="{ backgroundColor: `var(--color-${preset.primary}-500)` }"
          />
          <span class="flex-1">{{ preset.label }}</span>
          <UIcon
            v-if="themeId === preset.id"
            name="i-lucide-check"
            class="size-4 text-primary"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
