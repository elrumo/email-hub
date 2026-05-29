// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vite-pwa/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    dbFile: process.env.NUXT_DB_FILE || '/data/app.db',
    schedulerIntervalMs: process.env.NUXT_SCHEDULER_INTERVAL_MS || '',
    kumaUrl: process.env.NUXT_KUMA_URL || '',
    kumaApiKey: process.env.NUXT_KUMA_API_KEY || '',
    bunnyApiKey: process.env.NUXT_BUNNY_API_KEY || '',
    uiUsername: process.env.NUXT_UI_USERNAME || '',
    uiPassword: process.env.NUXT_UI_PASSWORD || '',
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
    // The app sits behind HTTP Basic auth — request the manifest with
    // credentials so the browser sends the auth header and avoids a 401.
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
      // Let the service worker run in `nuxt dev` so installability can be tested.
      enabled: true,
      type: 'module'
    }
  }
})
