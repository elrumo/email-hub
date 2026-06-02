<template>
  <div class="landing min-h-svh overflow-x-hidden bg-default text-default">
    <!-- ── header ─────────────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-50 border-b border-default/60 bg-default/70 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <span class="flex items-center gap-2.5">
          <span class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <UIcon
              name="i-lucide-workflow"
              class="size-4.5"
            />
          </span>
          <span class="text-base font-semibold tracking-tight text-highlighted">
            Flow Hub
          </span>
        </span>

        <nav class="hidden items-center gap-1 md:flex">
          <UButton
            label="Features"
            to="#features"
            color="neutral"
            variant="ghost"
            size="sm"
          />
          <UButton
            label="How it works"
            to="#how"
            color="neutral"
            variant="ghost"
            size="sm"
          />
          <UButton
            label="Integrations"
            to="#integrations"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </nav>

        <div class="flex items-center gap-2">
          <UColorModeButton />
          <UButton
            to="/login"
            label="Sign in"
            color="neutral"
            variant="ghost"
            size="sm"
          />
          <UButton
            to="/login"
            label="Get started"
            trailing-icon="i-lucide-arrow-right"
            size="sm"
          />
        </div>
      </div>
    </header>

    <!-- ── hero ───────────────────────────────────────────────────────────── -->
    <section class="relative">
      <div class="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 sm:pb-24 stagger">
        <div class="mx-auto inline-flex items-center gap-2 rounded-full border border-default bg-elevated/50 px-3 py-1 text-xs font-medium text-muted">
          <span class="relative flex size-2">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span class="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Self-hosted automation for your infrastructure
        </div>

        <h1 class="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-highlighted sm:text-6xl">
          Automate your infrastructure,
          <span class="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">visually</span>.
        </h1>

        <p class="mx-auto mt-6 max-w-2xl text-pretty text-base text-muted sm:text-lg">
          Flow Hub turns your servers, DNS, monitors and notifications into
          trigger&nbsp;→&nbsp;action flows that run on a schedule, a webhook, or the
          tap of a button. One container. Your data.
        </p>

        <div class="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <UButton
            to="/login"
            label="Get started free"
            size="xl"
            trailing-icon="i-lucide-arrow-right"
          />
          <UButton
            to="https://github.com/elrumo/flow-hub"
            target="_blank"
            label="View on GitHub"
            icon="i-simple-icons-github"
            color="neutral"
            variant="subtle"
            size="xl"
          />
        </div>

        <!-- app preview mock -->
        <div class="mx-auto mt-16 max-w-4xl">
          <div class="overflow-hidden rounded-2xl border border-default bg-elevated/40 shadow-2xl shadow-primary/5 ring-1 ring-default/50">
            <div class="flex items-center gap-1.5 border-b border-default/60 bg-default/40 px-4 py-3">
              <span class="size-3 rounded-full bg-red-400/70" />
              <span class="size-3 rounded-full bg-yellow-400/70" />
              <span class="size-3 rounded-full bg-green-400/70" />
              <span class="ml-3 text-xs text-dimmed">flow-hub · home</span>
            </div>
            <div class="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:gap-4 sm:p-6 stagger">
              <div
                v-for="tile in [
                  { icon: 'i-lucide-globe', label: 'DNS failover', sub: 'Healthy', tone: 'text-green-500' },
                  { icon: 'i-lucide-activity', label: 'API uptime', sub: '99.98%', tone: 'text-primary' },
                  { icon: 'i-lucide-bell', label: 'Alerts', sub: '2 today', tone: 'text-muted' },
                  { icon: 'i-lucide-cpu', label: 'web-01', sub: '34% CPU', tone: 'text-muted' },
                  { icon: 'i-lucide-workflow', label: 'Nightly backup', sub: 'Scheduled', tone: 'text-muted' },
                  { icon: 'i-lucide-mail', label: 'Digest email', sub: 'Sent 08:00', tone: 'text-muted' },
                  { icon: 'i-lucide-bar-chart-3', label: 'Visitors', sub: '1.2k / day', tone: 'text-primary' },
                  { icon: 'i-lucide-link', label: 'Dashboard', sub: 'Shortcut', tone: 'text-muted' }
                ]"
                :key="tile.label"
                class="flex flex-col items-start gap-2 rounded-xl border border-default/70 bg-default/60 p-3 text-left"
              >
                <UIcon
                  :name="tile.icon"
                  class="size-5 text-dimmed"
                />
                <div class="min-w-0">
                  <p class="truncate text-xs font-medium text-highlighted">
                    {{ tile.label }}
                  </p>
                  <p
                    class="truncate text-xs"
                    :class="tile.tone"
                  >
                    {{ tile.sub }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── integrations strip ─────────────────────────────────────────────── -->
    <section
      id="integrations"
      class="border-y border-default/60 bg-elevated/30 py-12"
    >
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <p class="text-center text-xs font-medium uppercase tracking-widest text-dimmed">
          Connects with the tools you already run
        </p>
        <div class="mt-8 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-6">
          <div
            v-for="item in integrations"
            :key="item.name"
            class="flex flex-col items-center gap-2 text-muted transition-colors hover:text-highlighted"
          >
            <UIcon
              :name="item.icon"
              class="size-7"
            />
            <span class="text-xs">{{ item.name }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── features bento ─────────────────────────────────────────────────── -->
    <section
      id="features"
      class="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28"
    >
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
          Everything to wire your stack together
        </h2>
        <p class="mt-4 text-pretty text-muted">
          A workflow engine, a monitoring dashboard and a connector toolkit — in one
          self-hosted app.
        </p>
      </div>

      <div class="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="group relative overflow-hidden rounded-2xl border border-default bg-elevated/40 p-6 transition-all duration-300 hover:border-primary/40 hover:bg-elevated/70"
          :class="feature.span ? 'lg:col-span-2' : ''"
        >
          <div class="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-105">
            <UIcon
              :name="feature.icon"
              class="size-5.5"
            />
          </div>
          <h3 class="mt-5 text-lg font-semibold text-highlighted">
            {{ feature.title }}
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            {{ feature.body }}
          </p>
        </div>
      </div>
    </section>

    <!-- ── how it works ───────────────────────────────────────────────────── -->
    <section
      id="how"
      class="border-y border-default/60 bg-elevated/30 py-20 sm:py-28"
    >
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
            Up and running in three steps
          </h2>
          <p class="mt-4 text-pretty text-muted">
            No glue scripts, no cron tabs to babysit. Connect, build, run.
          </p>
        </div>

        <div class="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          <div
            v-for="(step, i) in steps"
            :key="step.title"
            class="relative text-center"
          >
            <div class="mx-auto flex size-14 items-center justify-center rounded-2xl border border-default bg-default text-primary shadow-sm">
              <UIcon
                :name="step.icon"
                class="size-6"
              />
            </div>
            <span class="mt-4 inline-block text-xs font-semibold uppercase tracking-widest text-dimmed">
              Step {{ i + 1 }}
            </span>
            <h3 class="mt-1 text-lg font-semibold text-highlighted">
              {{ step.title }}
            </h3>
            <p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
              {{ step.body }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── final CTA ──────────────────────────────────────────────────────── -->
    <section class="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div class="relative rounded-3xl border border-primary/20 bg-primary/5 px-6 py-16 text-center sm:px-12">
        <h2 class="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
          Put your infrastructure on autopilot
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-pretty text-muted">
          Spin up Flow Hub, connect your services, and build your first flow in
          minutes. It's free and open source.
        </p>
        <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <UButton
            to="/login"
            label="Get started free"
            size="xl"
            trailing-icon="i-lucide-arrow-right"
          />
          <UButton
            to="https://github.com/elrumo/flow-hub"
            target="_blank"
            label="Star on GitHub"
            icon="i-simple-icons-github"
            color="neutral"
            variant="subtle"
            size="xl"
          />
        </div>
      </div>
    </section>

    <!-- ── footer ─────────────────────────────────────────────────────────── -->
    <footer class="border-t border-default/60">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <span class="flex items-center gap-2 text-sm text-muted">
          <span class="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-workflow"
              class="size-3.5"
            />
          </span>
          Flow Hub · © {{ year }}
        </span>
        <div class="flex items-center gap-1">
          <UButton
            to="/login"
            label="Sign in"
            color="neutral"
            variant="ghost"
            size="sm"
          />
          <UButton
            to="https://github.com/elrumo/flow-hub"
            target="_blank"
            icon="i-simple-icons-github"
            aria-label="GitHub"
            color="neutral"
            variant="ghost"
          />
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * Public marketing landing page — the app's index (`/`).
 *
 * Renders standalone (no app chrome; see app.vue `isStandalonePage`). The global
 * route guard (app/middleware/auth.global.ts) sends authenticated visitors on to
 * the app home (/home), so this page is only ever shown to logged-out visitors.
 */

const title = 'Flow Hub — Automate your infrastructure, visually'
const description
  = 'Flow Hub connects your servers, DNS, monitors and notifications into trigger → action flows that run on a schedule, a webhook, or the tap of a button. Self-hosted and yours.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})

// Integration logos shown in the "works with" strip. A mix of brand marks
// (simple-icons) and generic glyphs (lucide) for the in-house pieces.
const integrations = [
  { name: 'Dokploy', icon: 'i-lucide-container' },
  { name: 'Bunny.net', icon: 'i-lucide-rabbit' },
  { name: 'Uptime Kuma', icon: 'i-lucide-activity' },
  { name: 'Telegram', icon: 'i-simple-icons-telegram' },
  { name: 'Mailgun', icon: 'i-lucide-mail' },
  { name: 'MongoDB', icon: 'i-simple-icons-mongodb' },
  { name: 'Amazon S3', icon: 'i-simple-icons-amazons3' },
  { name: 'Home Assistant', icon: 'i-simple-icons-homeassistant' },
  { name: 'Plausible', icon: 'i-simple-icons-plausibleanalytics' },
  { name: 'Google Analytics', icon: 'i-simple-icons-googleanalytics' },
  { name: 'OpenAI', icon: 'i-simple-icons-openai' },
  { name: 'Anthropic', icon: 'i-simple-icons-anthropic' }
]

// Feature bento. The first card spans two columns for a stronger lead.
const features = [
  {
    icon: 'i-lucide-workflow',
    title: 'Visual flow builder',
    body: 'Chain a trigger to a sequence of actions on a drag-and-drop canvas. Pass data between steps, branch on conditions, and preview every run.',
    span: true
  },
  {
    icon: 'i-lucide-zap',
    title: 'Triggers that fit',
    body: 'Run flows on a cron schedule, an inbound webhook, a health-check ping, or a button you tap.'
  },
  {
    icon: 'i-lucide-plug',
    title: '15+ integrations',
    body: 'Dokploy, Bunny DNS, Uptime Kuma, Telegram, Mailgun, MongoDB, S3, Home Assistant and more — or import any OpenAPI spec.'
  },
  {
    icon: 'i-lucide-activity',
    title: 'Live monitoring',
    body: 'Uptime, machine and analytics monitors with sparklines, history and push alerts the moment something drifts.'
  },
  {
    icon: 'i-lucide-layout-grid',
    title: 'Bento home boards',
    body: 'Pin the shortcuts, flows and monitors you care about into a tidy grid. Make a board public to share it read-only.',
    span: true
  },
  {
    icon: 'i-lucide-sparkles',
    title: 'AI flow assistant',
    body: 'Describe what you want in plain language and let the assistant scaffold the flow for you.'
  },
  {
    icon: 'i-lucide-server',
    title: 'Self-hosted & installable',
    body: 'One container, your data. Installs as a PWA on desktop and mobile, with web push baked in.'
  }
]

// "How it works" — three plain steps.
const steps = [
  {
    icon: 'i-lucide-plug-zap',
    title: 'Connect',
    body: 'Add a connection for each service you use — paste an API key, or import an OpenAPI spec.'
  },
  {
    icon: 'i-lucide-workflow',
    title: 'Build',
    body: 'Pick a trigger, drop in actions, and wire the outputs of one step into the next.'
  },
  {
    icon: 'i-lucide-rocket',
    title: 'Run',
    body: 'Enable the flow and let it fire on schedule, on a webhook, or on demand — and watch it on your board.'
  }
]

const year = new Date().getFullYear()
</script>
