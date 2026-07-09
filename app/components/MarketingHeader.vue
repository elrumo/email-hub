<script setup lang="ts">
const { user } = useAuth()
const colorMode = useColorMode()
const selfHosted = useRuntimeConfig().public.selfHosted
</script>

<template>
  <header class="sticky top-0 z-50 pc-material border-b pc-hairline">
    <div class="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2.5 font-semibold">
        <span class="grid place-items-center w-7 h-7 rounded-[8px] bg-primary-500 text-white shadow-sm">
          <UIcon name="i-lucide-mail" class="w-4 h-4" />
        </span>
        <span class="tracking-tight">Postcard</span>
      </NuxtLink>

      <nav class="hidden md:flex items-center gap-7 text-sm pc-dim">
        <NuxtLink to="/#features" class="hover:text-(--pc-text) transition">Features</NuxtLink>
        <NuxtLink v-if="!selfHosted" to="/pricing" class="hover:text-(--pc-text) transition">Pricing</NuxtLink>
        <NuxtLink to="/docs/api" class="hover:text-(--pc-text) transition">API</NuxtLink>
      </nav>

      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
          aria-label="Toggle theme"
          @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
        />
        <template v-if="user">
          <UButton to="/app" color="neutral" variant="solid" size="sm">Open studio</UButton>
        </template>
        <template v-else>
          <UButton to="/login" color="neutral" variant="ghost" size="sm">Sign in</UButton>
          <UButton to="/signup" color="primary" size="sm">Get started</UButton>
        </template>
      </div>
    </div>
  </header>
</template>
