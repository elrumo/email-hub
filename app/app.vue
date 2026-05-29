<script setup lang="ts">
useHead({
  meta: [
    // `viewport-fit=cover` lets the standalone app draw under the iOS notch /
    // home indicator so it feels native once installed.
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#2563eb' },
    // iOS PWA: Safari ignores the web manifest, so these drive standalone mode,
    // the status-bar style and the home-screen title.
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    { name: 'apple-mobile-web-app-title', content: 'Flow Hub' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    // iOS home-screen icon — must be a real PNG; Safari won't use the manifest's.
    { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png', sizes: '180x180' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'Flow Hub'
const description = 'Automation flows for your infrastructure — connect Dokploy, Bunny, Uptime Kuma and more, then build trigger → action flows that run on a schedule, a webhook, or a button.'

const route = useRoute()
const nav = [
  { label: 'Flows', to: '/', icon: 'i-lucide-workflow' },
  { label: 'Connections', to: '/connections', icon: 'i-lucide-plug' },
  { label: 'Monitoring', to: '/monitoring', icon: 'i-lucide-activity' }
]
function isActive(to: string) {
  return to === '/' ? route.path === '/' || route.path.startsWith('/flows') : route.path.startsWith(to)
}

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
      :toggle="{ class: 'sm:hidden' }"
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

      <nav class="hidden items-center gap-1 sm:flex">
        <UButton
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="item.label"
          size="sm"
          :color="isActive(item.to) ? 'primary' : 'neutral'"
          :variant="isActive(item.to) ? 'soft' : 'ghost'"
        />
      </nav>

      <template #right>
        <UColorModeButton />

        <UButton
          to="https://github.com/elrumo/flow-hub"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </template>

      <!-- Mobile menu — rendered in UHeader's built-in slide-over, toggled by
           the hamburger that appears automatically below the sm breakpoint. -->
      <template #content>
        <nav class="flex flex-col gap-1">
          <UButton
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            :icon="item.icon"
            :label="item.label"
            size="lg"
            block
            :ui="{ base: 'justify-start' }"
            :color="isActive(item.to) ? 'primary' : 'neutral'"
            :variant="isActive(item.to) ? 'soft' : 'ghost'"
          />
        </nav>
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
          to="https://github.com/elrumo/flow-hub"
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
