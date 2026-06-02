<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Postcard — Design email like a native app' })

const features = [
  { icon: 'i-lucide-sparkles', title: 'Postcard AI', body: 'Describe the email you want. The assistant builds and edits it block-by-block while you watch the preview update live.' },
  { icon: 'i-lucide-blocks', title: 'Structured blocks', body: 'Headings, text, buttons, images, columns and dividers — a typed model that renders identically across Gmail, Apple Mail and Outlook.' },
  { icon: 'i-lucide-braces', title: 'Mustache variables', body: 'Drop {{ firstName }} anywhere and personalize at send time. Defaults power instant previews.' },
  { icon: 'i-lucide-webhook', title: 'REST API', body: 'Fetch the rendered HTML of any project over a clean, documented API — with variable substitution built in.' },
  { icon: 'i-lucide-palette', title: 'Pixel-perfect', body: 'A studio that feels like a native macOS app: frosted materials, hairline detail, and calm, confident motion.' },
  { icon: 'i-lucide-gauge', title: 'Usage you can see', body: 'Every AI request is metered against your plan, with clear limits and a transparent account view.' }
]
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative overflow-hidden">
      <div class="absolute inset-0 pc-aurora pointer-events-none" />
      <div class="relative mx-auto max-w-6xl px-5 pt-20 pb-10 text-center">
        <div class="pc-rise inline-flex items-center gap-2 rounded-full border pc-hairline pc-material px-3 py-1 text-xs pc-dim mb-6">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500" /> AI-native email design studio
        </div>
        <h1 class="pc-rise text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          Design email like a
          <span class="bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent">native app.</span>
        </h1>
        <p class="pc-rise-2 mt-6 text-lg pc-dim max-w-2xl mx-auto">
          Postcard is a beautiful studio for crafting emails that render everywhere — with an AI co-designer,
          reusable template variables, and an API to fetch your HTML on demand.
        </p>
        <div class="pc-rise-3 mt-8 flex items-center justify-center gap-3">
          <UButton to="/signup" size="lg" color="primary" trailing-icon="i-lucide-arrow-right">Start designing free</UButton>
          <UButton to="/docs/api" size="lg" color="neutral" variant="subtle">Explore the API</UButton>
        </div>
      </div>

      <!-- App window mockup -->
      <div class="relative mx-auto max-w-5xl px-5 pb-16">
        <div class="pc-window pc-rise-3 pc-float">
          <div class="pc-titlebar pc-material">
            <TrafficLights />
            <div class="flex-1 text-center text-[13px] pc-dim">Postcard — Editor</div>
          </div>
          <div class="grid grid-cols-12 h-[360px]">
            <div class="col-span-2 border-r pc-hairline p-3 space-y-2 pc-sidebar-material hidden sm:block">
              <div v-for="i in 5" :key="i" class="h-7 rounded-md bg-black/5 dark:bg-white/5" :style="{ width: `${60 + i * 6}%` }" />
            </div>
            <div class="col-span-12 sm:col-span-6 p-6 bg-(--pc-bg) flex items-center justify-center">
              <div class="w-full max-w-sm rounded-xl bg-white shadow-lg p-6 space-y-3">
                <div class="h-8 w-2/3 mx-auto rounded bg-primary-500/90" />
                <div class="h-3 rounded bg-zinc-200" />
                <div class="h-3 w-5/6 rounded bg-zinc-200" />
                <div class="h-24 rounded-lg bg-gradient-to-br from-primary-400 to-purple-400" />
                <div class="h-9 w-1/2 mx-auto rounded-lg bg-zinc-900" />
              </div>
            </div>
            <div class="col-span-4 border-l pc-hairline p-3 hidden sm:flex flex-col gap-2">
              <div class="text-xs pc-dim px-1">Postcard AI</div>
              <div class="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary-500 text-white text-xs px-3 py-2">Make the hero pop with a gradient.</div>
              <div class="max-w-[85%] rounded-2xl rounded-bl-sm bg-black/5 dark:bg-white/10 text-xs px-3 py-2">Done — added a gradient banner and a bold CTA. ✨</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section id="features" class="mx-auto max-w-6xl px-5 py-16">
      <h2 class="text-3xl font-semibold tracking-tight text-center">Everything you need to ship beautiful email</h2>
      <p class="text-center pc-dim mt-3 max-w-xl mx-auto">A focused toolset with the polish of a desktop app and the power of a modern API.</p>
      <div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="f in features" :key="f.title" class="pc-card p-6 hover:-translate-y-0.5 transition">
          <div class="grid place-items-center w-11 h-11 rounded-xl bg-primary-500/10 text-primary-500 mb-4">
            <UIcon :name="f.icon" class="w-5 h-5" />
          </div>
          <h3 class="font-semibold">{{ f.title }}</h3>
          <p class="text-sm pc-dim mt-1.5 leading-relaxed">{{ f.body }}</p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="mx-auto max-w-6xl px-5 py-10">
      <div class="pc-window p-12 text-center relative overflow-hidden">
        <div class="absolute inset-0 pc-aurora opacity-70" />
        <div class="relative">
          <h2 class="text-3xl font-semibold tracking-tight">Your next email is one prompt away.</h2>
          <p class="pc-dim mt-3">Start free. Upgrade when you grow.</p>
          <UButton to="/signup" size="lg" color="primary" class="mt-6" trailing-icon="i-lucide-arrow-right">Create your account</UButton>
        </div>
      </div>
    </section>
  </div>
</template>
