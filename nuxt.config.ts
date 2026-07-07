export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  compatibilityDate: '2025-01-01',

  runtimeConfig: {
    sessionCookieSecure: '',
    ai: {
      baseUrl: '',
      apiKey: '',
      model: 'mini-v2'
    },
    stripe: {
      secretKey: '',
      webhookSecret: '',
      priceStarter: '',
      pricePro: ''
    },
    mail: {
      smtpHost: '',
      smtpPort: '587',
      smtpSecure: '',
      smtpUser: '',
      smtpPass: '',
      from: ''
    },
    public: {
      appName: 'Postcard',
      appUrl: ''
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
  // The bun-test suite (tests/) is typechecked by bun, not vue-tsc — the
  // `bun:test` module types aren't part of the Nuxt tsconfig.
  typescript: {
    tsConfig: { exclude: ['../tests'] }
  },
  nitro: {
    externals: { inline: ['stripe', 'parse'] }
  }
})
