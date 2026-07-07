<script setup lang="ts">
const { user, logout } = useAuth()
const route = useRoute()
const colorMode = useColorMode()

const nav = computed(() => [
  { label: 'Emails', icon: 'i-lucide-layout-grid', to: '/app' },
  { label: 'API & keys', icon: 'i-lucide-key-round', to: '/app/keys' },
  { label: 'Account', icon: 'i-lucide-user-round', to: '/app/account' },
  ...(user.value?.role === 'admin'
    ? [{ label: 'Admin', icon: 'i-lucide-shield', to: '/app/admin' }]
    : [])
])

const sectionTitle = computed(() => {
  if (route.path.startsWith('/app/projects/')) return 'Editor'
  if (route.path.startsWith('/app/keys')) return 'API & keys'
  if (route.path.startsWith('/app/account')) return 'Account'
  if (route.path.startsWith('/app/admin')) return 'Admin'
  return 'Emails'
})

const initials = computed(() => {
  const base = user.value?.name || user.value?.email || '?'
  return base.slice(0, 1).toUpperCase()
})
</script>

<template>
  <div class="h-screen p-0 sm:p-3 bg-(--pc-bg)">
    <div class="pc-window h-full flex flex-col">
      <!-- Titlebar -->
      <div class="pc-titlebar pc-material shrink-0">
        <TrafficLights />
        <div class="flex-1 text-center text-[13px] font-medium pc-dim select-none">
          Postcard — {{ sectionTitle }}
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
          aria-label="Toggle theme"
          @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
        />
      </div>

      <div class="flex-1 flex min-h-0">
        <!-- Sidebar -->
        <aside class="w-[230px] shrink-0 pc-sidebar-material border-r pc-hairline flex flex-col">
          <div class="p-3">
            <UButton to="/app/new" block color="primary" icon="i-lucide-plus" class="justify-center">
              New email
            </UButton>
          </div>
          <nav class="px-2 space-y-0.5">
            <NuxtLink
              v-for="item in nav"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition"
              :class="route.path === item.to || (item.to === '/app' && route.path.startsWith('/app/projects'))
                ? 'bg-primary-500 text-white shadow-sm'
                : 'pc-dim hover:bg-black/5 dark:hover:bg-white/5 hover:text-(--pc-text)'"
            >
              <UIcon :name="item.icon" class="w-4 h-4" />
              {{ item.label }}
            </NuxtLink>
          </nav>

          <div class="mt-auto p-3 border-t pc-hairline">
            <div class="flex items-center gap-2.5">
              <span class="grid place-items-center w-8 h-8 rounded-full bg-primary-500 text-white text-sm font-semibold">
                {{ initials }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-[13px] font-medium truncate">{{ user?.name || 'Account' }}</div>
                <div class="text-[11px] pc-dim truncate capitalize">{{ user?.plan }} plan</div>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-log-out"
                aria-label="Sign out"
                @click="logout"
              />
            </div>
          </div>
        </aside>

        <!-- Content -->
        <main class="flex-1 min-w-0 min-h-0 overflow-auto pc-scroll bg-(--pc-window-solid)">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
