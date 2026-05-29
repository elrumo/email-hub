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
const router = useRouter()
const auth = useAuth()

// Hide the app chrome (header/footer/nav) on pages that render standalone: the
// auth pages (centered card) and public board views at /b/<slug> (no sign-in,
// their own minimal header).
const isAuthPage = computed(() =>
  route.path === '/login' || route.path === '/setup' || route.path.startsWith('/b/')
)

async function onLogout() {
  await auth.logout()
  await router.replace('/login')
}

const userMenu = computed(() => [
  [{ label: auth.user.value?.username ?? 'Account', type: 'label' as const }],
  [
    { label: 'Account', icon: 'i-lucide-user', to: '/account' },
    ...(auth.isAdmin.value ? [{ label: 'Admin', icon: 'i-lucide-shield', to: '/admin' }] : [])
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: onLogout }]
])

const nav = [
  { label: 'Home', to: '/', icon: 'i-lucide-layout-grid' },
  { label: 'Flows', to: '/flows', icon: 'i-lucide-workflow' },
  { label: 'Emails', to: '/emails', icon: 'i-lucide-mail' },
  { label: 'Shortcuts', to: '/shortcuts', icon: 'i-lucide-link' },
  { label: 'Connections', to: '/connections', icon: 'i-lucide-plug' },
  { label: 'Monitoring', to: '/monitoring', icon: 'i-lucide-activity' }
]
function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
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
    <!-- Auth pages render their own centered card with no app chrome. -->
    <UMain v-if="isAuthPage">
      <NuxtPage />
    </UMain>

    <template v-else>
      <UHeader
        :toggle="{ class: 'sm:hidden' }"
        :ui="{
          root: 'app-header border-none backdrop-blur',
          center: 'gap-2',
          container: 'max-w-[2000px]!'
        }"
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
          <PushToggle />

          <UColorModeButton />

          <UButton
            to="https://github.com/elrumo/flow-hub"
            target="_blank"
            icon="i-simple-icons-github"
            aria-label="GitHub"
            color="neutral"
            variant="ghost"
          />

          <UDropdownMenu
            v-if="auth.user.value"
            :items="userMenu"
          >
            <UButton
              color="neutral"
              variant="ghost"
              trailing-icon="i-lucide-chevron-down"
            >
              <UAvatar
                :alt="auth.user.value.username"
                size="2xs"
                icon="i-lucide-user"
              />
              <span class="hidden text-sm sm:inline">{{ auth.user.value.username }}</span>
            </UButton>
          </UDropdownMenu>
        </template>

        <!-- Mobile menu body — keep UHeader's built-in mobile header chrome so
           the title/actions still render when the menu opens. -->
        <template #body>
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

      <!-- <UFooter :ui="{ root: 'border-none' }">
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
      </UFooter> -->
    </template>
  </UApp>
</template>
