<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'dokploy-doctor'
const description = 'DNS failover monitor — watches Uptime Kuma and steers Bunny DNS records to a healthy origin.'

useSeoMeta({
  title,
  titleTemplate: chunk => (chunk && chunk !== title ? `${chunk} · ${title}` : title),
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <UHeader
      :ui="{ root: 'border-none backdrop-blur', center: 'gap-2' }"
    >
      <template #title>
        <span class="flex items-center gap-2.5">
          <span class="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <UIcon
              name="i-lucide-stethoscope"
              class="size-4"
            />
          </span>
          <span class="text-base font-semibold tracking-tight text-highlighted">Dokploy Doctor</span>
        </span>
      </template>

      <template #right>
        <UColorModeButton />

        <UButton
          to="https://github.com/macosicons/dokploy-doctor"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter :ui="{ root: 'border-none' }">
      <template #left>
        <p class="text-sm text-muted">
          Dokploy Doctor · © {{ new Date().getFullYear() }}
        </p>
      </template>

      <template #right>
        <UButton
          to="https://github.com/macosicons/dokploy-doctor"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </template>
    </UFooter>
  </UApp>
</template>
