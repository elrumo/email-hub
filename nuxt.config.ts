// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  compatibilityDate: '2025-01-01',

  // Server-only runtime config. Everything here is read on the server and never
  // shipped to the client unless mirrored under `public`. The AI provider lives
  // here on purpose — the product never reveals which model/provider powers the
  // assistant, so its base URL, key and model id stay server-side.
  runtimeConfig: {
    databaseUrl: '', // NUXT_DATABASE_URL
    sessionCookieSecure: '', // NUXT_SESSION_COOKIE_SECURE ("1" to force secure)

    // The assistant's upstream. We speak the OpenAI dialect (LiteLLM is
    // OpenAI-compatible); the user never sees any of this.
    ai: {
      baseUrl: '', // NUXT_AI_BASE_URL  (LiteLLM gateway, e.g. http://litellm:4000/v1)
      apiKey: '', // NUXT_AI_API_KEY
      model: 'mini-v2' // NUXT_AI_MODEL
    },

    stripe: {
      secretKey: '', // NUXT_STRIPE_SECRET_KEY
      webhookSecret: '', // NUXT_STRIPE_WEBHOOK_SECRET
      priceStarter: '', // NUXT_STRIPE_PRICE_STARTER
      pricePro: '' // NUXT_STRIPE_PRICE_PRO
    },

    public: {
      appName: 'Postcard',
      appUrl: '' // NUXT_PUBLIC_APP_URL
    }
  },

  app: {
    head: {
      title: 'Postcard — Design email like a native app',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Postcard is a beautiful, AI-native studio for designing emails that render everywhere.' }
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },

  ui: {
    colorMode: true
  },

  future: { compatibilityVersion: 4 },
  nitro: {
    // Inline `stripe` into the server bundle. Its package.json exposes a `bun`
    // export condition that points at a worker build the dep tracer doesn't copy,
    // which breaks `bun --bun` at runtime; bundling it sidesteps the trace.
    externals: { inline: ['stripe'] }
  }
})
