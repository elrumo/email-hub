<script setup lang="ts">
// Switches the whole visual theme at runtime — geometry, surfaces, typography
// and depth — via a reactive data-theme attribute + app config (see useTheme).
// Complements UColorModeButton, which is the separate light/dark axis.
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
      <div class="w-60 p-2">
        <p class="px-2 pb-1.5 pt-1 text-xs font-medium text-muted">
          Theme
        </p>
        <button
          v-for="preset in themePresets"
          :key="preset.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-elevated"
          @click="setTheme(preset.id)"
        >
          <span
            class="size-7 shrink-0 ring-1 ring-inset ring-black/10 dark:ring-white/15"
            :class="preset.square ? 'rounded-none' : 'rounded-full'"
            :style="{ background: preset.swatch }"
          />
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm"
              :class="themeId === preset.id ? 'font-medium text-highlighted' : 'text-default'"
            >{{ preset.label }}</span>
            <span class="block truncate text-xs text-muted">{{ preset.hint }}</span>
          </span>
          <UIcon
            v-if="themeId === preset.id"
            name="i-lucide-check"
            class="size-4 shrink-0 text-primary"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
