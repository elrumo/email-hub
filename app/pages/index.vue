<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Mapping, useStatus } from '~/composables/useStatus'

const { data, offline, refresh } = await useStatus(5000)

const fqdns = computed(() => Object.keys(data.value.mappings || {}))
const footerInfo = computed(() => {
  const n = fqdns.value.length
  return [
    `${n} ${n === 1 ? 'mapping' : 'mappings'}`,
    `Poll ${Math.round(data.value.pollIntervalMs / 1000)}s`,
    `Cooldown ${Math.round(data.value.cooldownMs / 60_000)}m`
  ].join(' · ')
})

// editor / delete modal state
const editorOpen = ref(false)
const editingMapping = ref<Mapping | null>(null)
const deleteTarget = ref<string | null>(null)

function openAdd() {
  editingMapping.value = null
  editorOpen.value = true
}
async function openEdit(fqdn: string) {
  // fetch the canonical mapping (snapshot doesn't contain bunnyZoneId/recordName/healthPath)
  const res = await fetch('/api/mappings')
  const all: Mapping[] = await res.json()
  editingMapping.value = all.find(m => m.fqdn === fqdn) ?? null
  if (editingMapping.value) editorOpen.value = true
}
function closeEditor() {
  editorOpen.value = false
  editingMapping.value = null
}
async function onSaved() {
  closeEditor()
  await refresh()
}
function askDelete(fqdn: string) {
  deleteTarget.value = fqdn
}
async function onDeleted() {
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <AppHeader
      :data="data"
      :offline="offline"
      @add="openAdd"
      @check="refresh"
    />

    <main>
      <div
        v-if="fqdns.length === 0"
        class="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-default py-20 text-center"
      >
        <span class="flex size-12 items-center justify-center rounded-2xl bg-elevated text-dimmed">
          <UIcon
            name="i-lucide-radio-tower"
            class="size-6"
          />
        </span>
        <div class="space-y-1">
          <p class="text-base font-medium text-highlighted">
            No mappings yet
          </p>
          <p class="text-sm text-muted">
            Add a hostname to start watching it for failover.
          </p>
        </div>
        <UButton
          label="Add Your First Mapping"
          icon="i-lucide-plus"
          color="primary"
          @click="openAdd"
        />
      </div>

      <div
        v-else
        class="flex flex-col gap-4"
      >
        <MappingCard
          v-for="fqdn in fqdns"
          :key="fqdn"
          :fqdn="fqdn"
          :snapshot="data.mappings[fqdn]!"
          :history="data.history[fqdn] || []"
          :cooldown-ms="data.cooldownMs"
          @edit="openEdit(fqdn)"
          @delete="askDelete(fqdn)"
        />
      </div>

      <MonitorsPanel
        v-if="data.monitors.length"
        :monitors="data.monitors"
        class="mt-4"
      />
    </main>

    <p class="mt-10 text-center font-mono text-xs tabular-nums text-dimmed">
      {{ footerInfo }}
    </p>

    <MappingEditor
      v-if="editorOpen"
      :existing="editingMapping"
      @close="closeEditor"
      @saved="onSaved"
    />
    <DeleteConfirm
      v-if="deleteTarget"
      :fqdn="deleteTarget"
      @close="deleteTarget = null"
      @confirmed="onDeleted"
    />
  </UContainer>
</template>
