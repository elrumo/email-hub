<script setup lang="ts">
// Default to the system look; users keep their choice via Nuxt UI color mode.
useHead({
  bodyAttrs: { class: 'antialiased' }
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
