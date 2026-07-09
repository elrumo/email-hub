<script setup lang="ts">
const { user, logout } = useAuth()
const route = useRoute()
const colorMode = useColorMode()

const initials = computed(() => {
  const base = user.value?.name || user.value?.email || '?'
  return base.slice(0, 1).toUpperCase()
})

const navItems = [
  { label: 'Home', icon: 'i-lucide-home', to: '/app/new' },
  { label: 'Projects', icon: 'i-lucide-layout-grid', to: '/app' },
]

const bottomNav = computed(() => [
  { label: 'API & keys', icon: 'i-lucide-key-round', to: '/app/keys' },
  { label: 'Account', icon: 'i-lucide-user-round', to: '/app/account' },
  ...(user.value?.role === 'admin'
    ? [{ label: 'Admin', icon: 'i-lucide-shield', to: '/app/admin' }]
    : [])
])
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="app-sidebar">
      <!-- Logo -->
      <div class="sidebar-logo">
        <div class="sidebar-logo-mark">
          <svg viewBox="0 0 20 20" fill="none" class="w-5 h-5">
            <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.5" />
            <path d="M2 7l8 5 8-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </div>
        <span class="sidebar-logo-text">Postcard</span>
      </div>

      <!-- New email button -->
      <NuxtLink to="/app/new" class="sidebar-new-btn">
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        New email
      </NuxtLink>

      <!-- Primary nav -->
      <nav class="sidebar-nav">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="sidebar-nav-item"
          :class="route.path === item.to && 'sidebar-nav-item--active'"
        >
          <UIcon :name="item.icon" class="w-4 h-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Bottom nav -->
      <nav class="sidebar-nav sidebar-nav--bottom">
        <NuxtLink
          v-for="item in bottomNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-nav-item"
          :class="route.path === item.to && 'sidebar-nav-item--active'"
        >
          <UIcon :name="item.icon" class="w-4 h-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Footer: theme + user -->
      <div class="sidebar-footer">
        <button
          class="sidebar-theme-btn"
          aria-label="Toggle theme"
          @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
        >
          <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-4 h-4" />
        </button>
        <div class="sidebar-user">
          <span class="sidebar-user-avatar">{{ initials }}</span>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">{{ user?.name || 'Account' }}</div>
          </div>
        </div>
        <button class="sidebar-logout-btn" aria-label="Sign out" @click="logout">
          <UIcon name="i-lucide-log-out" class="w-4 h-4" />
        </button>
      </div>
    </aside>

    <!-- Content -->
    <main class="app-content pc-scroll">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Sidebar ───────────────────────────────────────────────────────────── */
.app-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--pc-sidebar);
  border-right: 1px solid var(--pc-border);
  padding: 12px 10px;
  overflow-y: auto;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  margin-bottom: 6px;
}

.sidebar-logo-mark {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: var(--pc-text);
  color: var(--pc-bg);
}

.sidebar-logo-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--pc-text);
  letter-spacing: -0.01em;
}

/* ── New email button ──────────────────────────────────────────────────── */
.sidebar-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 7px 10px;
  margin-bottom: 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text);
  background: var(--pc-hover);
  border: 1px solid var(--pc-border);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-decoration: none;
  font-family: inherit;
}

.sidebar-new-btn:hover {
  background: var(--pc-border);
  border-color: var(--pc-border-strong);
}

/* ── Navigation ────────────────────────────────────────────────────────── */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0;
}

.sidebar-nav--bottom {
  border-top: 1px solid var(--pc-border);
  padding-top: 6px;
  margin-top: 4px;
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 450;
  color: var(--pc-text-dim);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  text-decoration: none;
  font-family: inherit;
}

.sidebar-nav-item:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

.sidebar-nav-item--active {
  background: var(--pc-hover);
  color: var(--pc-text);
  font-weight: 500;
}

/* ── Footer ────────────────────────────────────────────────────────────── */
.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 2px 2px;
  border-top: 1px solid var(--pc-border);
  margin-top: 4px;
}

.sidebar-theme-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--pc-text-dim);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
  background: transparent;
  border: none;
  font-family: inherit;
}

.sidebar-theme-btn:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
}

.sidebar-user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--pc-text);
  color: var(--pc-bg);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.sidebar-user-info {
  min-width: 0;
}

.sidebar-user-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--pc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-logout-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--pc-text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
  background: transparent;
  border: none;
  font-family: inherit;
}

.sidebar-logout-btn:hover {
  background: var(--pc-hover);
  color: var(--pc-text);
}

/* ── Content ───────────────────────────────────────────────────────────── */
.app-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--pc-bg);
}
</style>
