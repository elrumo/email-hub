// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  // The server runs on Bun; pull in Bun's ambient types so `bun:sqlite` and
  // friends typecheck in the Nitro tsconfig.
  nitro: {
    typescript: {
      tsConfig: {
        compilerOptions: {
          types: ['bun-types']
        }
      }
    }
  },

  runtimeConfig: {
    dbFile: process.env.NUXT_DB_FILE || "/data/app.db",
    schedulerIntervalMs: process.env.NUXT_SCHEDULER_INTERVAL_MS || "",
    kumaUrl: process.env.NUXT_KUMA_URL || "",
    kumaApiKey: process.env.NUXT_KUMA_API_KEY || "",
    bunnyApiKey: process.env.NUXT_BUNNY_API_KEY || "",
    uiUsername: process.env.NUXT_UI_USERNAME || "",
    uiPassword: process.env.NUXT_UI_PASSWORD || "",
    discordWebhookUrl: process.env.NUXT_DISCORD_WEBHOOK_URL || "",
    notifyTransitions: process.env.NUXT_NOTIFY_TRANSITIONS || "",
    kumaErrorThreshold: process.env.NUXT_KUMA_ERROR_THRESHOLD || "",
    pollIntervalMs: process.env.NUXT_POLL_INTERVAL_MS || "",
    cooldownMs: process.env.NUXT_COOLDOWN_MS || "",
    failThreshold: process.env.NUXT_FAIL_THRESHOLD || "",
    probeTimeoutMs: process.env.NUXT_PROBE_TIMEOUT_MS || "",
    historyMax: process.env.NUXT_HISTORY_MAX || "",
    bunnyCacheMs: process.env.NUXT_BUNNY_CACHE_MS || "",
    stateFile: process.env.NUXT1_STATE_FILE || "",
    mappingsFile: process.env.NUXT_MAPPINGS_FILE || "",
    seedMappingsFile: process.env.NUXT_SEED_MAPPINGS || "",
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
