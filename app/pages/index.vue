<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Postcard — Design email like a native app' })

// ── Animated hero ──────────────────────────────────────────────
const heroRef = ref<HTMLElement>()
const heroStep = ref(-1) // -1 = idle, 0+ = animation steps
const userTypingLen = ref(0)
const visibleBlocks = ref(0)
const visibleAi = ref(0)
const reducedMotion = ref(false)

const fullPrompt = 'Build a bold product launch email with a hero image, feature columns, and a CTA button.'

const heroBlocks = [
  { kind: 'eyebrow' as const, text: 'New release', color: '#2563eb' },
  { kind: 'heading' as const, text: 'Introducing your new workspace' },
  { kind: 'text' as const, body: 'A cleaner dashboard, smarter automation, and instant visibility across the tools your team already uses.' },
  { kind: 'image' as const },
  { kind: 'columns' as const, left: ['Automate', 'Trigger reliable workflows from your team events.'], right: ['Monitor', 'Spot issues early with concise status snapshots.'] },
  { kind: 'button' as const, label: 'Explore the launch', bg: '#2563eb' },
]

// Typed references for template access
const heroEyebrow = computed(() => heroBlocks[0] as { kind: 'eyebrow'; text: string; color: string })
const heroHeading = computed(() => heroBlocks[1] as { kind: 'heading'; text: string })
const heroText = computed(() => heroBlocks[2] as { kind: 'text'; body: string })
const heroColumns = computed(() => heroBlocks[4] as { kind: 'columns'; left: string[]; right: string[] })
const heroButton = computed(() => heroBlocks[5] as { kind: 'button'; label: string; bg: string })

const aiMessages = [
  'Added a bold headline and intro copy.',
  'Added a product image and feature columns.',
  'Done — your launch email is ready. Edit any block or change the theme. \u2728',
]

// Step definitions: each step has a duration and an action
const steps: Array<{ duration: number; action: () => void }> = []

function buildSteps() {
  steps.length = 0
  // Idle
  steps.push({ duration: 2000, action: () => { heroStep.value = 0 } })
  // Typing user message (character by character)
  steps.push({ duration: 3000, action: () => { heroStep.value = 1; userTypingLen.value = 0; typeUserMessage() } })
  // Thinking dots
  steps.push({ duration: 1200, action: () => { heroStep.value = 2 } })
  // Block 1: eyebrow
  steps.push({ duration: 1200, action: () => { heroStep.value = 3; visibleBlocks.value = 1 } })
  // Block 2: heading
  steps.push({ duration: 1200, action: () => { visibleBlocks.value = 2 } })
  // Block 3: text
  steps.push({ duration: 1200, action: () => { visibleBlocks.value = 3 } })
  // AI message 1
  steps.push({ duration: 1500, action: () => { heroStep.value = 4; visibleAi.value = 1 } })
  // Block 4: image
  steps.push({ duration: 1500, action: () => { visibleBlocks.value = 4 } })
  // Block 5: columns
  steps.push({ duration: 1200, action: () => { visibleBlocks.value = 5 } })
  // AI message 2
  steps.push({ duration: 1500, action: () => { visibleAi.value = 2 } })
  // Block 6: button
  steps.push({ duration: 1500, action: () => { visibleBlocks.value = 6 } })
  // AI message 3 (done)
  steps.push({ duration: 3500, action: () => { heroStep.value = 5; visibleAi.value = 3 } })
  // Hold
  steps.push({ duration: 3000, action: () => {} })
}

let stepTimeout: ReturnType<typeof setTimeout> | null = null
let typeInterval: ReturnType<typeof setInterval> | null = null
let currentStepIdx = 0
let observer: IntersectionObserver | null = null
let heroVisible = true
let animationRunning = false

function typeUserMessage() {
  userTypingLen.value = 0
  if (typeInterval) clearInterval(typeInterval)
  typeInterval = setInterval(() => {
    userTypingLen.value++
    if (userTypingLen.value >= fullPrompt.length) {
      clearInterval(typeInterval!)
      typeInterval = null
    }
  }, 35)
}

function runStep() {
  if (!animationRunning || !heroVisible) return
  if (currentStepIdx >= steps.length) {
    // Loop: reset and restart
    resetHero()
    currentStepIdx = 0
    stepTimeout = setTimeout(runStep, 800)
    return
  }
  const step = steps[currentStepIdx]!
  step.action()
  currentStepIdx++
  stepTimeout = setTimeout(runStep, step.duration)
}

function resetHero() {
  if (stepTimeout) { clearTimeout(stepTimeout); stepTimeout = null }
  if (typeInterval) { clearInterval(typeInterval); typeInterval = null }
  heroStep.value = -1
  userTypingLen.value = 0
  visibleBlocks.value = 0
  visibleAi.value = 0
}

function startAnimation() {
  if (animationRunning) return
  animationRunning = true
  resetHero()
  buildSteps()
  currentStepIdx = 0
  stepTimeout = setTimeout(runStep, 500)
}

function pauseAnimation() {
  animationRunning = false
  if (stepTimeout) { clearTimeout(stepTimeout); stepTimeout = null }
  if (typeInterval) { clearInterval(typeInterval); typeInterval = null }
}

// ── Feature showcase ───────────────────────────────────────────
const showcaseFeatures = [
  {
    icon: 'i-lucide-sparkles',
    title: 'AI builds what you describe',
    body: 'Describe the email you want in plain language. Postcard AI interprets your intent and assembles a polished, structured email block by block — with real content, real layout, and real style.',
    bullets: ['Natural language to email in seconds', 'Edits existing emails the same way'],
    side: 'left' as const,
  },
  {
    icon: 'i-lucide-check-circle',
    title: 'One email, every client',
    body: 'Every block renders as table-based, inline-styled HTML that works identically across Gmail, Apple Mail, and Outlook. No more client-specific hacks.',
    bullets: ['Gmail, Apple Mail, Outlook — tested', 'Table-based layout, inline styles'],
    side: 'right' as const,
  },
  {
    icon: 'i-lucide-braces',
    title: 'Variables and API, built in',
    body: 'Drop {{ firstName }} anywhere in your email and personalize at send time. Fetch rendered HTML over a clean REST API with variable substitution built in.',
    bullets: ['Mustache template variables', 'Documented REST API with API keys'],
    side: 'left' as const,
  },
]

const compactFeatures = [
  { icon: 'i-lucide-palette', title: '7 themes, one click', body: 'Switch between Postcard, Midnight, Forest, and more — colors and fonts rewrite instantly.' },
  { icon: 'i-lucide-gauge', title: 'Usage you can see', body: 'Every AI request is metered against your plan with clear limits and a transparent account view.' },
  { icon: 'i-lucide-monitor', title: 'Studio-grade feel', body: 'Frosted materials, hairline borders, and calm motion — a tool that feels as good as the emails it makes.' },
]

// ── Template gallery ───────────────────────────────────────────
const templateCards = [
  { id: 'launch', name: 'Product Launch', style: 'Bold & modern', accent: '#2563eb', bg: '#eef2ff', darkBg: '#1e1b4b' },
  { id: 'digest', name: 'Editorial Digest', style: 'Clean editorial', accent: '#0f766e', bg: '#f0fdfa', darkBg: '#042f2e' },
  { id: 'sale', name: 'Flash Sale', style: 'Urgent & minimal', accent: '#dc2626', bg: '#fef2f2', darkBg: '#450a0a' },
  { id: 'welcome', name: 'Warm Welcome', style: 'Soft & friendly', accent: '#7c3aed', bg: '#f5f3ff', darkBg: '#2e1065' },
  { id: 'event', name: 'Event Invite', style: 'Dark & dramatic', accent: '#f59e0b', bg: '#111827', darkBg: '#111827' },
  { id: 'account', name: 'Account Update', style: 'Utility first', accent: '#0891b2', bg: '#ecfeff', darkBg: '#083344' },
]

// ── Trust bar ──────────────────────────────────────────────────
const logos = ['Acme', 'Globex', 'Initech', 'Hooli', 'Pied Piper']

// ── Scroll reveal ──────────────────────────────────────────────
onMounted(() => {
  // Check reduced motion preference
  if (typeof window !== 'undefined') {
    reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  // Scroll reveal observer
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('pc-rise')
          revealObserver.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12 },
  )
  document.querySelectorAll('.pc-reveal').forEach(el => revealObserver.observe(el))

  // Hero viewport observer — pause/resume animation
  if (heroRef.value) {
    observer = new IntersectionObserver(
      (entries) => {
        heroVisible = entries[0]?.isIntersecting ?? false
        if (heroVisible && !animationRunning && !reducedMotion.value) {
          startAnimation()
        } else if (!heroVisible) {
          pauseAnimation()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(heroRef.value)
  }

  // Start animation (or show final state for reduced motion)
  if (reducedMotion.value) {
    visibleBlocks.value = heroBlocks.length
    visibleAi.value = aiMessages.length
    heroStep.value = 5
    userTypingLen.value = fullPrompt.length
  } else {
    startAnimation()
  }
})

onUnmounted(() => {
  pauseAnimation()
  observer?.disconnect()
})
</script>

<template>
  <div>
    <!-- Hero -->
    <section ref="heroRef" class="relative overflow-hidden">
      <div class="absolute inset-0 pc-aurora pointer-events-none" />
      <div class="relative mx-auto max-w-6xl px-5 pt-20 pb-10 text-center">
        <div class="pc-rise inline-flex items-center gap-2 rounded-full border pc-hairline pc-material px-3 py-1 text-xs pc-dim mb-6">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500" /> AI-native email design studio
        </div>
        <h1 class="pc-rise text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          Describe it.
          <span class="bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent">Postcard designs it.</span>
        </h1>
        <p class="pc-rise-2 mt-6 text-lg pc-dim max-w-2xl mx-auto">
          The email studio where your words become pixel-perfect, client-safe HTML —
          built by AI, refined by you, sent via API.
        </p>
        <div class="pc-rise-3 mt-8 flex items-center justify-center gap-3">
          <UButton to="/signup" size="lg" color="primary" trailing-icon="i-lucide-arrow-right">Start designing free</UButton>
          <UButton to="/docs/api" size="lg" color="neutral" variant="subtle">Explore the API</UButton>
        </div>
      </div>

      <!-- Animated app window mockup -->
      <div class="relative mx-auto max-w-5xl px-5 pb-16">
        <div class="pc-window pc-rise-3" :class="{ 'pc-float': visibleBlocks === heroBlocks.length && heroStep === 5 }">
          <!-- Titlebar -->
          <div class="pc-titlebar pc-material">
            <TrafficLights />
            <div class="flex-1 text-center text-[13px] pc-dim">Postcard — Editor</div>
          </div>

          <!-- 3-pane layout -->
          <div class="grid grid-cols-12 h-[380px] md:h-[420px]">
            <!-- Left sidebar -->
            <div class="col-span-2 border-r pc-hairline p-3 space-y-2 pc-sidebar-material hidden md:block">
              <div v-for="i in 6" :key="i" class="h-6 rounded-md bg-black/5 dark:bg-white/5" :style="{ width: `${50 + i * 7}%` }" />
            </div>

            <!-- Center: email preview -->
            <div class="col-span-12 md:col-span-6 p-4 md:p-6 bg-(--pc-bg) flex items-start justify-center overflow-hidden">
              <div class="w-full max-w-sm space-y-0">
                <!-- Email container -->
                <div class="rounded-xl bg-white shadow-lg overflow-hidden" style="color: #1a1a1a;">
                  <!-- Block 0: eyebrow -->
                  <div v-if="visibleBlocks >= 1" class="pc-block-enter px-6 pt-6 pb-1">
                    <p class="text-center text-xs font-semibold uppercase tracking-widest" :style="{ color: heroEyebrow.color }">
                      {{ heroEyebrow.text }}
                    </p>
                  </div>
                  <!-- Block 1: heading -->
                  <div v-if="visibleBlocks >= 2" class="pc-block-enter px-6 pt-3 pb-2">
                    <h3 class="text-center text-xl font-bold" style="color: #111827;">
                      {{ heroHeading.text }}
                    </h3>
                  </div>
                  <!-- Block 2: text -->
                  <div v-if="visibleBlocks >= 3" class="pc-block-enter px-6 py-2">
                    <p class="text-center text-sm leading-relaxed" style="color: #6b7280;">
                      {{ heroText.body }}
                    </p>
                  </div>
                  <!-- Block 3: image -->
                  <div v-if="visibleBlocks >= 4" class="pc-block-enter px-6 py-3">
                    <div class="h-28 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <UIcon name="i-lucide-image" class="w-8 h-8 text-white/60" />
                    </div>
                  </div>
                  <!-- Block 4: columns -->
                  <div v-if="visibleBlocks >= 5" class="pc-block-enter px-6 py-3">
                    <div class="grid grid-cols-2 gap-3">
                      <div class="rounded-lg p-3" style="background: #f9fafb;">
                        <p class="text-xs font-semibold mb-1" style="color: #111827;">{{ heroColumns.left[0] }}</p>
                        <p class="text-[11px]" style="color: #6b7280;">{{ heroColumns.left[1] }}</p>
                      </div>
                      <div class="rounded-lg p-3" style="background: #f9fafb;">
                        <p class="text-xs font-semibold mb-1" style="color: #111827;">{{ heroColumns.right[0] }}</p>
                        <p class="text-[11px]" style="color: #6b7280;">{{ heroColumns.right[1] }}</p>
                      </div>
                    </div>
                  </div>
                  <!-- Block 5: button -->
                  <div v-if="visibleBlocks >= 6" class="pc-block-enter px-6 py-4 pb-6">
                    <div class="flex justify-center">
                      <span class="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold text-white" :style="{ background: heroButton.bg }">
                        {{ heroButton.label }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: AI chat panel -->
            <div class="col-span-4 border-l pc-hairline p-3 hidden md:flex flex-col gap-2">
              <div class="text-xs pc-dim px-1 font-medium">Postcard AI</div>

              <!-- User message -->
              <div v-if="heroStep >= 1" class="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary-500 text-white text-xs px-3 py-2">
                {{ fullPrompt.slice(0, userTypingLen) }}<span v-if="userTypingLen < fullPrompt.length" class="inline-block w-px h-3 bg-white/70 animate-pulse ml-px" />
              </div>

              <!-- Thinking dots -->
              <div v-if="heroStep === 2" class="max-w-[60%] rounded-2xl rounded-bl-sm bg-black/5 dark:bg-white/10 px-3 py-2.5">
                <div class="pc-dot-pulse flex gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-current pc-dim" />
                  <span class="w-1.5 h-1.5 rounded-full bg-current pc-dim" />
                  <span class="w-1.5 h-1.5 rounded-full bg-current pc-dim" />
                </div>
              </div>

              <!-- AI messages -->
              <template v-for="(msg, i) in aiMessages" :key="i">
                <div v-if="visibleAi >= i + 1" class="pc-block-enter max-w-[85%] rounded-2xl rounded-bl-sm bg-black/5 dark:bg-white/10 text-xs px-3 py-2">
                  {{ msg }}
                </div>
              </template>

              <!-- Input field with cursor -->
              <div class="mt-auto">
                <div class="rounded-xl border pc-hairline px-3 py-2 text-xs pc-text-muted flex items-center gap-2">
                  <span v-if="heroStep <= 0" class="pc-cursor pc-dim">Describe the email you want...</span>
                  <span v-else class="pc-dim">Ask for changes...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Trust bar -->
    <section class="mx-auto max-w-6xl px-5 py-10">
      <p class="text-center text-sm pc-dim mb-6">Trusted by teams building better email</p>
      <div class="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-30">
        <span v-for="name in logos" :key="name" class="text-lg font-semibold tracking-tight">{{ name }}</span>
      </div>
      <blockquote class="mt-8 text-center max-w-xl mx-auto">
        <p class="text-base italic pc-dim">"Postcard cut our email design time from hours to minutes. The AI understands layout better than most designers."</p>
        <cite class="text-sm mt-3 block not-italic font-medium">— Sarah Chen, Head of Marketing at Acme</cite>
      </blockquote>
    </section>

    <!-- Feature showcase: 3 alternating large sections -->
    <section id="features" class="mx-auto max-w-6xl px-5 py-16">
      <div v-for="(f, idx) in showcaseFeatures" :key="f.title" class="pc-reveal py-16" :class="{ 'border-t pc-hairline': idx > 0 }">
        <div class="grid md:grid-cols-2 gap-10 items-center" :class="{ 'md:[direction:rtl]': f.side === 'right' }">
          <!-- Visual -->
          <div class="[direction:ltr]" :class="{ 'md:order-2': f.side === 'right' }">
            <!-- AI chat visual -->
            <div v-if="idx === 0" class="pc-window p-4 space-y-3 max-w-sm mx-auto">
              <div class="text-xs pc-dim font-medium px-1">Postcard AI</div>
              <div class="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary-500 text-white text-xs px-3 py-2">
                Create a welcome email with a friendly tone and a sign-up button.
              </div>
              <div class="max-w-[85%] rounded-2xl rounded-bl-sm bg-black/5 dark:bg-white/10 text-xs px-3 py-2">
                Done — here's a warm welcome email with a headline, intro copy, and a violet CTA button.
              </div>
              <div class="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary-500 text-white text-xs px-3 py-2">
                Make the button green instead.
              </div>
              <div class="max-w-[85%] rounded-2xl rounded-bl-sm bg-black/5 dark:bg-white/10 text-xs px-3 py-2">
                Updated — the button is now emerald green. ✨
              </div>
            </div>

            <!-- Cross-client rendering visual -->
            <div v-else-if="idx === 1" class="flex gap-3 justify-center">
              <div v-for="client in ['Gmail', 'Apple Mail', 'Outlook']" :key="client" class="pc-card p-3 w-36">
                <div class="flex items-center gap-1.5 mb-2">
                  <UIcon name="i-lucide-check-circle" class="w-3.5 h-3.5 text-green-500" />
                  <span class="text-[11px] font-medium">{{ client }}</span>
                </div>
                <div class="space-y-1.5">
                  <div class="h-2 w-3/4 mx-auto rounded bg-primary-500/80" />
                  <div class="h-1.5 rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div class="h-1.5 w-5/6 rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div class="h-8 rounded bg-gradient-to-br from-primary-400/30 to-purple-400/30" />
                  <div class="h-3 w-1/2 mx-auto rounded bg-zinc-900 dark:bg-zinc-100" />
                </div>
              </div>
            </div>

            <!-- API visual -->
            <div v-else class="pc-window max-w-sm mx-auto">
              <div class="pc-titlebar pc-material">
                <TrafficLights />
                <div class="flex-1 text-center text-[13px] pc-dim">api-example.sh</div>
              </div>
              <pre class="p-4 text-xs leading-relaxed overflow-x-auto pc-scroll"><code><span class="text-green-600 dark:text-green-400">$</span> curl -H <span class="text-purple-500">"Authorization: Bearer pc_live_..."</span> \
  <span class="text-primary-500">https://api.postcard.so/v1/projects</span>/<span class="text-amber-500">:id</span>/html?firstName=Ada

<span class="pc-dim">{</span>
  <span class="text-green-600 dark:text-green-400">"html"</span>: <span class="text-purple-500">"&lt;table role=...&gt;"</span>,
  <span class="text-green-600 dark:text-green-400">"variables"</span>: { <span class="text-amber-500">"firstName"</span>: <span class="text-purple-500">"Ada"</span> }
<span class="pc-dim">}</span></code></pre>
            </div>
          </div>

          <!-- Text -->
          <div class="[direction:ltr]">
            <div class="grid place-items-center w-11 h-11 rounded-xl bg-primary-500/10 text-primary-500 mb-4">
              <UIcon :name="f.icon" class="w-5 h-5" />
            </div>
            <h3 class="text-2xl font-semibold tracking-tight">{{ f.title }}</h3>
            <p class="pc-dim mt-3 leading-relaxed">{{ f.body }}</p>
            <ul class="mt-4 space-y-2">
              <li v-for="b in f.bullets" :key="b" class="flex items-start gap-2 text-sm">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                <span>{{ b }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Compact feature cards -->
      <div class="pc-reveal grid sm:grid-cols-3 gap-4 mt-8">
        <div v-for="f in compactFeatures" :key="f.title" class="pc-card p-5 relative overflow-hidden hover:-translate-y-0.5 transition">
          <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary-500 to-purple-500" />
          <div class="grid place-items-center w-9 h-9 rounded-lg bg-primary-500/10 text-primary-500 mb-3">
            <UIcon :name="f.icon" class="w-4 h-4" />
          </div>
          <h4 class="font-semibold text-sm">{{ f.title }}</h4>
          <p class="text-xs pc-dim mt-1.5 leading-relaxed">{{ f.body }}</p>
        </div>
      </div>
    </section>

    <!-- Template gallery -->
    <section class="py-16 overflow-hidden">
      <div class="mx-auto max-w-6xl px-5">
        <h2 class="pc-reveal text-3xl font-semibold tracking-tight text-center">Start from a template</h2>
        <p class="pc-reveal text-center pc-dim mt-3">Six professionally designed starting points. Pick one and make it yours.</p>
      </div>
      <div class="mt-10 flex gap-4 overflow-x-auto pc-scroll px-5 pb-4 snap-x snap-mandatory">
        <div
          v-for="t in templateCards"
          :key="t.id"
          class="pc-card flex-shrink-0 w-64 snap-start overflow-hidden hover:-translate-y-0.5 transition cursor-pointer"
        >
          <div class="h-1.5" :style="{ background: t.accent }" />
          <div class="p-4 space-y-2" :style="{ background: t.bg }">
            <div class="h-3 w-1/2 mx-auto rounded" :style="{ background: t.accent }" />
            <div class="h-1.5 rounded bg-black/10" />
            <div class="h-1.5 w-3/4 rounded bg-black/10" />
            <div class="h-12 rounded-lg" :style="{ background: t.accent + '25' }" />
            <div class="h-4 w-1/3 mx-auto rounded-md" :style="{ background: t.accent }" />
          </div>
          <div class="px-4 py-3 border-t pc-hairline">
            <div class="text-sm font-medium">{{ t.name }}</div>
            <div class="text-xs pc-dim">{{ t.style }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="mx-auto max-w-6xl px-5 py-10">
      <div class="pc-window p-12 text-center relative overflow-hidden">
        <div class="absolute inset-0 pc-aurora opacity-70" />
        <div class="relative">
          <h2 class="text-3xl font-semibold tracking-tight">Stop coding email HTML. Start designing.</h2>
          <p class="pc-dim mt-3">Free to start. No credit card required.</p>
          <div class="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <UButton to="/signup" size="lg" color="primary" trailing-icon="i-lucide-arrow-right">Start designing free</UButton>
            <UButton to="/docs/api" size="lg" color="neutral" variant="subtle">Explore the API</UButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
