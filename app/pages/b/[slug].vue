<script setup lang="ts">
import type { PublicBoard } from '~/types'

/**
 * Public, read-only board view — the project's bento.me-style link-sharing
 * page. Open to unauthenticated visitors (the global route guard and server
 * middleware both exempt /b/* — see app/middleware/auth.global.ts and
 * server/api/public/*). Renders the board's tiles using only the display
 * fields the public endpoint returns; flow tiles show a Run button only when
 * the flow is publicly triggerable.
 */
const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data, error } = await useFetch<PublicBoard>(`/api/public/boards/${slug.value}`, {
  key: () => `public-board:${slug.value}`
})

const board = computed(() => data.value?.board ?? null)
const widgets = computed(() => data.value?.widgets ?? [])
const shortcutOf = (id?: string | null) => data.value?.shortcuts.find(s => s.id === id)
const flowOf = (id?: string | null) => data.value?.flows.find(f => f.id === id)
const monitorOf = (id?: string | null) => data.value?.monitors.find(m => m.id === id)

// A single letter for the profile avatar, like bento.me's monogram.
const initial = computed(() => (board.value?.name ?? '·').trim().charAt(0).toUpperCase() || '·')
const tileCount = computed(() => widgets.value.length)

useSeoMeta({
  title: () => board.value?.name ?? 'Board',
  robots: 'noindex'
})

const toast = useToast()
const running = ref<string | null>(null)
async function runFlow(flowId: string) {
  if (!board.value) return
  running.value = flowId
  try {
    const res = await $fetch<{ status: string }>(
      `/api/public/boards/${board.value.slug}/flows/${flowId}/run`,
      { method: 'POST', body: {} }
    )
    toast.add({ title: `Flow ${res.status}`, color: res.status === 'error' ? 'error' : 'success' })
  } catch (e: unknown) {
    const msg = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not run flow'
    toast.add({ title: msg, color: 'error' })
  } finally {
    running.value = null
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
</script>

<template>
  <UMain class="board-canvas min-h-screen">
    <UContainer class="py-14 sm:py-20">
      <div
        v-if="error || !board"
        class="flex flex-col items-center gap-4 py-24 text-center"
      >
        <span class="flex size-14 items-center justify-center rounded-2xl bg-elevated text-dimmed">
          <UIcon
            name="i-lucide-eye-off"
            class="size-7"
          />
        </span>
        <p class="text-lg font-semibold text-highlighted">
          This board isn’t available
        </p>
        <p class="text-sm text-muted">
          It may be private or no longer exist.
        </p>
      </div>

      <template v-else>
        <!-- bento.me-style profile header -->
        <header class="mb-10 flex flex-col items-center text-center sm:mb-14">
          <span class="avatar-monogram flex size-20 items-center justify-center rounded-full text-3xl font-semibold text-inverted">
            {{ initial }}
          </span>
          <h1 class="mt-5 text-3xl font-semibold tracking-tight text-highlighted">
            {{ board.name }}
          </h1>
          <p class="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-elevated/70 px-3 py-1 text-xs font-medium text-muted ring-1 ring-default">
            <UIcon
              name="i-lucide-layout-grid"
              class="size-3.5"
            />
            {{ tileCount }} {{ tileCount === 1 ? 'tile' : 'tiles' }}
          </p>
        </header>

        <div
          v-if="widgets.length === 0"
          class="mx-auto max-w-md rounded-3xl border border-dashed border-default bg-default/60 py-20 text-center text-sm text-muted"
        >
          This board has no tiles yet.
        </div>

        <div
          v-else
          class="grid auto-rows-[8.5rem] grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          <div
            v-for="w in widgets"
            :key="w.id"
            :style="{ gridColumn: `span ${w.w}`, gridRow: `span ${w.h}` }"
          >
            <!-- shortcut: the whole tile is the link, with a nudging arrow -->
            <a
              v-if="w.kind === 'shortcut' && shortcutOf(w.refId)"
              :href="shortcutOf(w.refId)!.url"
              target="_blank"
              rel="noopener noreferrer"
              class="bento-card group flex h-full flex-col justify-between bg-default p-4 ring-1 ring-default"
            >
              <span class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated text-muted">
                <img
                  v-if="isImageIcon(shortcutOf(w.refId)!.icon)"
                  :src="shortcutOf(w.refId)!.icon!"
                  alt=""
                  class="size-6 rounded-md"
                >
                <UIcon
                  v-else
                  :name="shortcutOf(w.refId)!.icon || 'i-lucide-link'"
                  class="size-6"
                />
              </span>
              <span class="mt-3 min-w-0">
                <span class="flex items-center justify-between gap-2">
                  <span class="truncate font-medium text-highlighted">{{ shortcutOf(w.refId)!.name }}</span>
                  <UIcon
                    name="i-lucide-arrow-up-right"
                    class="size-4 shrink-0 text-dimmed transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </span>
                <span class="mt-0.5 block truncate text-sm text-dimmed">{{ hostOf(shortcutOf(w.refId)!.url) }}</span>
              </span>
            </a>

            <!-- flow -->
            <div
              v-else-if="w.kind === 'flow' && flowOf(w.refId)"
              class="bento-card flex h-full flex-col gap-2 bg-default p-4 ring-1 ring-default"
            >
              <div class="flex items-center gap-2 font-medium text-highlighted">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted">
                  <UIcon
                    name="i-lucide-workflow"
                    class="size-4"
                  />
                </span>
                <span class="truncate">{{ flowOf(w.refId)!.name }}</span>
              </div>
              <p
                v-if="flowOf(w.refId)!.description"
                class="line-clamp-2 text-sm text-muted"
              >
                {{ flowOf(w.refId)!.description }}
              </p>
              <UButton
                v-if="flowOf(w.refId)!.canTrigger"
                icon="i-lucide-play"
                label="Run"
                color="neutral"
                variant="soft"
                size="sm"
                class="mt-auto self-start"
                :loading="running === w.refId"
                @click="runFlow(w.refId!)"
              />
              <UBadge
                v-else
                color="neutral"
                variant="soft"
                size="sm"
                class="mt-auto self-start"
              >
                View only
              </UBadge>
            </div>

            <!-- monitor -->
            <PublicMonitorTile
              v-else-if="w.kind === 'monitor' && monitorOf(w.refId)"
              :board-slug="board.slug"
              :monitor="monitorOf(w.refId)!"
            />

            <!-- note -->
            <div
              v-else-if="w.kind === 'note'"
              class="bento-card h-full bg-default p-4 ring-1 ring-default"
            >
              <p class="h-full overflow-auto whitespace-pre-wrap text-sm text-muted">
                {{ w.content || 'Empty note' }}
              </p>
            </div>
          </div>
        </div>

        <!-- gentle bento.me-style footer credit -->
        <footer class="mt-14 flex justify-center">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-elevated/60 px-3 py-1.5 text-xs font-medium text-dimmed ring-1 ring-default">
            <UIcon
              name="i-lucide-stethoscope"
              class="size-3.5 text-primary"
            />
            Made with Flow Hub
          </span>
        </footer>
      </template>
    </UContainer>
  </UMain>
</template>

<style scoped>
/* Soft, theme-aware backdrop so the tiles read as floating cards — a faint
   primary glow up top fading into the page background, à la bento.me. */
.board-canvas {
  background:
    radial-gradient(60rem 32rem at 50% -8rem, color-mix(in oklab, var(--ui-primary) 12%, transparent), transparent 70%),
    var(--ui-bg-muted);
}

/* Monogram avatar — a confident primary gradient. */
.avatar-monogram {
  background-image: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 90%, white 10%),
    color-mix(in oklab, var(--ui-primary) 70%, black 18%)
  );
  box-shadow: 0 10px 28px -10px color-mix(in oklab, var(--ui-primary) 60%, transparent);
}
</style>
