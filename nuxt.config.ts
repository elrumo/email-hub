// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@comark/nuxt', '@vite-pwa/nuxt', '@vueuse/nuxt'],

  devtools: {
    // Off: DevTools instruments the whole module graph, which slows HMR
    // rebuilds. Re-enable when you actually need the inspector.
    enabled: false
  },

  app: {
    // App-wide route + layout transitions. `out-in` lets the leaving page finish
    // fading before the next one rises in, so navigations read as a single,
    // deliberate motion rather than a cross-fade blur. The matching CSS lives in
    // assets/css/main.css (`.page-*`), and is disabled under
    // prefers-reduced-motion there.
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'page', mode: 'out-in' }
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    dbFile: process.env.NUXT_DB_FILE || '/data/app.db',
    // Web Push (VAPID). Left empty by default — keys are auto-generated and
    // persisted in the DB on first use, so push works with zero config. Set
    // these to pin a fixed keypair (e.g. so a re-deploy doesn't invalidate
    // existing browser subscriptions). vapidSubject is an abuse-contact mailto.
    vapidPublicKey: process.env.NUXT_VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.NUXT_VAPID_PRIVATE_KEY || '',
    vapidSubject: process.env.NUXT_VAPID_SUBJECT || '',
    schedulerIntervalMs: process.env.NUXT_SCHEDULER_INTERVAL_MS || '',
    kumaUrl: process.env.NUXT_KUMA_URL || '',
    kumaApiKey: process.env.NUXT_KUMA_API_KEY || '',
    bunnyApiKey: process.env.NUXT_BUNNY_API_KEY || '',
    // NUXT_UI_USERNAME/NUXT_UI_PASSWORD (the old shared HTTP Basic credential)
    // are removed — auth is now per-user accounts with session cookies
    // (server/middleware/auth.ts + server/utils/auth.ts). These env vars can be
    // dropped from the deploy environment.
    discordWebhookUrl: process.env.NUXT_DISCORD_WEBHOOK_URL || '',
    notifyTransitions: process.env.NUXT_NOTIFY_TRANSITIONS || '',
    kumaErrorThreshold: process.env.NUXT_KUMA_ERROR_THRESHOLD || '',
    pollIntervalMs: process.env.NUXT_POLL_INTERVAL_MS || '',
    cooldownMs: process.env.NUXT_COOLDOWN_MS || '',
    failThreshold: process.env.NUXT_FAIL_THRESHOLD || '',
    probeTimeoutMs: process.env.NUXT_PROBE_TIMEOUT_MS || '',
    historyMax: process.env.NUXT_HISTORY_MAX || '',
    bunnyCacheMs: process.env.NUXT_BUNNY_CACHE_MS || '',
    stateFile: process.env.NUXT1_STATE_FILE || '',
    mappingsFile: process.env.NUXT_MAPPINGS_FILE || '',
    seedMappingsFile: process.env.NUXT_SEED_MAPPINGS || ''
  },

  compatibilityDate: '2025-01-15',

  // The server runs on Bun; pull in Bun's ambient types so `bun:sqlite` and
  // friends typecheck in the Nitro tsconfig.
  nitro: {
    // Build for the Bun runtime so Nitro emits a Bun-targeted server.
    preset: 'bun',
    // Flow scheduling runs as Nitro tasks (server/tasks/flows/*). The internal
    // loop in server/plugins/engine.ts drives `flows:tick` on Bun (where the
    // preset doesn't run scheduledTasks); this cron entry additionally drives it
    // in dev and on presets that do support scheduledTasks. Single-instance task
    // semantics + the cron lastRunAt guard keep the two drivers idempotent.
    experimental: {
      tasks: true
    },
    scheduledTasks: {
      '* * * * *': ['flows:tick']
    },
    // `bun:sqlite` is a Bun built-in — keep it out of the bundle so it
    // resolves natively at runtime instead of Rollup trying (and failing) to
    // bundle it, which is what produces the "could not be resolved" warning.
    externals: {
      external: ['bun:sqlite']
    },
    rollupConfig: {
      external: [/^bun:/]
    },
    typescript: {
      tsConfig: {
        compilerOptions: {
          types: ['bun-types']
        }
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Installable PWA. iOS needs the apple-touch-icon + apple meta tags (added in
  // app.vue) on top of the manifest; the manifest alone is ignored by Safari.
  pwa: {
    registerType: 'autoUpdate',
    // The app is gated by a session cookie — request the manifest with
    // credentials so the browser sends the cookie and avoids a 401.
    useCredentials: true,
    manifest: {
      name: 'Flow Hub',
      short_name: 'Flow Hub',
      description: 'Automation flows for your infrastructure.',
      theme_color: '#2563eb',
      background_color: '#0a0a0a',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      // Pre-cache the built app shell; API calls stay network-first so flow
      // data is never served stale.
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      // Fold our Web Push handlers (push + notificationclick) into the
      // generated service worker. The file lives in public/ so it ships at the
      // site root and shares the SW scope.
      importScripts: ['/sw-push.js'],
      navigateFallback: '/',
      runtimeCaching: [
        {
          urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            networkTimeoutSeconds: 10,
            expiration: { maxEntries: 64, maxAgeSeconds: 60 * 5 }
          }
        }
      ]
    },
    client: {
      installPrompt: true
    },
    devOptions: {
      // Off by default in dev: the SW regenerates on every rebuild, which slows
      // HMR and can serve stale modules. Flip to `true` (or set
      // NUXT_PWA_DEV=1) only when you specifically need to test installability.
      enabled: process.env.NUXT_PWA_DEV === '1',
      type: 'module'
    }
  }
})
