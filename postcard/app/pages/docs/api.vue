<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'API — Postcard' })

interface OpenApiDoc {
  info: { title: string, version: string, description: string }
  servers: { url: string }[]
  paths: Record<string, Record<string, { summary: string, description?: string }>>
}

const { data } = await useFetch<OpenApiDoc>('/api/openapi.json')

const endpoints = computed(() => {
  const out: { method: string, path: string, summary: string, description?: string }[] = []
  const paths = data.value?.paths ?? {}
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      out.push({ method: method.toUpperCase(), path, summary: op.summary, description: op.description })
    }
  }
  return out
})

const methodColor: Record<string, string> = {
  GET: 'bg-green-500/15 text-green-600 dark:text-green-400',
  POST: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  DELETE: 'bg-red-500/15 text-red-600 dark:text-red-400'
}
const server = computed(() => data.value?.servers?.[0]?.url ?? '/api/v1')

// Literal mustache braces can't be written inside Vue interpolation.
const mustacheVar = '{{ firstName }}'
const mustacheGeneric = '{{ mustache }}'
</script>

<template>
  <div class="mx-auto max-w-4xl px-5 py-16">
    <div class="pc-rise">
      <h1 class="text-4xl font-semibold tracking-tight">{{ data?.info.title }}</h1>
      <p class="pc-dim mt-3 max-w-2xl">{{ data?.info.description }}</p>
      <div class="flex items-center gap-3 mt-4">
        <UBadge color="neutral" variant="soft">v{{ data?.info.version }}</UBadge>
        <a href="/api/openapi.json" class="text-sm text-primary-500 hover:underline flex items-center gap-1">
          <UIcon name="i-lucide-file-json" class="w-4 h-4" /> OpenAPI schema
        </a>
      </div>
    </div>

    <!-- Auth -->
    <div class="pc-card p-6 mt-10">
      <h2 class="font-semibold flex items-center gap-2"><UIcon name="i-lucide-key-round" class="w-4 h-4 text-primary-500" /> Authentication</h2>
      <p class="text-sm pc-dim mt-2">Create a key under <NuxtLink to="/app/keys" class="text-primary-500 hover:underline">API &amp; keys</NuxtLink> and send it as a bearer token.</p>
      <pre class="text-xs bg-black/5 dark:bg-white/10 rounded-lg p-4 mt-3 overflow-auto pc-scroll"><code>Authorization: Bearer pc_live_…</code></pre>
    </div>

    <!-- Base URL -->
    <div class="pc-card p-6 mt-4">
      <h2 class="font-semibold">Base URL</h2>
      <pre class="text-xs bg-black/5 dark:bg-white/10 rounded-lg p-4 mt-3 overflow-auto pc-scroll"><code>{{ server }}</code></pre>
    </div>

    <!-- Endpoints -->
    <h2 class="text-2xl font-semibold tracking-tight mt-12 mb-4">Endpoints</h2>
    <div class="space-y-3">
      <div v-for="ep in endpoints" :key="`${ep.method}-${ep.path}`" class="pc-card p-5">
        <div class="flex items-center gap-3">
          <span class="text-xs font-bold font-mono rounded-md px-2 py-1" :class="methodColor[ep.method]">{{ ep.method }}</span>
          <code class="text-sm font-mono">{{ ep.path }}</code>
        </div>
        <p class="text-sm font-medium mt-3">{{ ep.summary }}</p>
        <p v-if="ep.description" class="text-sm pc-dim mt-1 leading-relaxed">{{ ep.description }}</p>
      </div>
    </div>

    <!-- Example -->
    <h2 class="text-2xl font-semibold tracking-tight mt-12 mb-4">Example: render with variables</h2>
    <div class="pc-card p-6">
      <pre class="text-xs bg-black/5 dark:bg-white/10 rounded-lg p-4 overflow-auto pc-scroll"><code># Render a project to raw HTML, substituting {{ mustacheVar }}
curl -H "Authorization: Bearer pc_live_…" \
  "{{ server }}/projects/PROJECT_ID/html?firstName=Ada&format=html"</code></pre>
      <p class="text-sm pc-dim mt-3">
        Any query param that matches a <code>{{ mustacheGeneric }}</code> variable is substituted; unspecified
        variables fall back to the sample value you set in the editor.
      </p>
    </div>
  </div>
</template>
