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
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        // Geist — the typeface Postcard's studio is designed around.
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap'
        }
      ]
    }
  },

  ui: {
    colorMode: true
  },

  future: { compatibilityVersion: 4 },
  nitro: {
    externals: { inline: ['stripe', 'parse'] }
  }
})
