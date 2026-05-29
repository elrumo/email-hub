<script setup lang="ts">
import type { PublicBoard } from '~/types'

/**
 * Public, read-only board view. Open to unauthenticated visitors (the global
 * route guard and server middleware both exempt /b/* — see
 * app/middleware/auth.global.ts and server/api/public/*). Renders the board's
 * tiles using only the display fields the public endpoint returns; flow tiles
 * show a Run button only when the flow is publicly triggerable.
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
  <UMain class="min-h-screen">
    <UContainer class="py-10 sm:py-14">
      <div
        v-if="error || !board"
        class="flex flex-col items-center gap-4 py-24 text-center"
      >
        <UIcon
          name="i-lucide-eye-off"
          class="size-8 text-dimmed"
        />
        <p class="font-medium text-highlighted">
          This board isn’t available
        </p>
        <p class="text-sm text-muted">
          It may be private or no longer exist.
        </p>
      </div>

      <template v-else>
        <div class="mb-8">
          <h1 class="text-xl font-semibold tracking-tight text-highlighted">
            {{ board.name }}
          </h1>
          <p class="mt-1 text-sm text-muted">
            A public board.
          </p>
        </div>

        <div
          v-if="widgets.length === 0"
          class="rounded-2xl border border-dashed border-default py-20 text-center text-sm text-muted"
        >
          This board has no tiles yet.
        </div>

        <div
          v-else
          class="grid auto-rows-[8rem] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          <div
            v-for="w in widgets"
            :key="w.id"
            :style="{ gridColumn: `span ${w.w}`, gridRow: `span ${w.h}` }"
          >
            <!-- shortcut -->
            <UCard
              v-if="w.kind === 'shortcut' && shortcutOf(w.refId)"
              class="h-full"
              :ui="{ body: 'flex h-full flex-col gap-2' }"
            >
              <a
                :href="shortcutOf(w.refId)!.url"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2.5 text-highlighted hover:text-primary"
              >
                <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
                  <UIcon
                    :name="shortcutOf(w.refId)!.icon || 'i-lucide-link'"
                    class="size-5"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ shortcutOf(w.refId)!.name }}</span>
                  <span class="block truncate text-sm text-dimmed">{{ hostOf(shortcutOf(w.refId)!.url) }}</span>
                </span>
              </a>
            </UCard>

            <!-- flow -->
            <UCard
              v-else-if="w.kind === 'flow' && flowOf(w.refId)"
              class="h-full"
              :ui="{ body: 'flex h-full flex-col gap-2' }"
            >
              <div class="flex items-center gap-2 font-medium text-highlighted">
                <UIcon
                  name="i-lucide-workflow"
                  class="size-4 shrink-0 text-dimmed"
                />
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
            </UCard>

            <!-- monitor -->
            <PublicMonitorTile
              v-else-if="w.kind === 'monitor' && monitorOf(w.refId)"
              :board-slug="board.slug"
              :monitor="monitorOf(w.refId)!"
            />

            <!-- note -->
            <UCard
              v-else-if="w.kind === 'note'"
              class="h-full"
              :ui="{ body: 'h-full' }"
            >
              <p class="h-full overflow-auto whitespace-pre-wrap text-sm text-muted">
                {{ w.content || 'Empty note' }}
              </p>
            </UCard>
          </div>
        </div>
      </template>
    </UContainer>
  </UMain>
</template>
