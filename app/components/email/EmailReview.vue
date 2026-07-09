<script setup lang="ts">
/**
 * The Review tab — the deterministic email linter (shared/email/lint.ts) run
 * live against the current document. Click a finding to select the offending
 * block; "Fix with AI" hands the finding's fix instruction to Postcard AI.
 */
import type { LintIssue } from '#shared/email/lint'

const props = defineProps<{
  /** lint findings, computed once by the editor page */
  issues: LintIssue[]
  /** whether the AI chat is available (owner only) */
  canAi?: boolean
  /** disables Fix buttons while the AI is already working */
  aiBusy?: boolean
}>()

const emit = defineEmits<{
  /** 'select' carries a block id; 'fix' carries an AI fix instruction */
  (e: 'select' | 'fix', value: string): void
}>()

const issues = computed(() => props.issues)
const errors = computed(() => issues.value.filter(i => i.severity === 'error'))
const warnings = computed(() => issues.value.filter(i => i.severity === 'warning'))

const fixableCount = computed(() => issues.value.filter(i => i.fixPrompt).length)

function onIssueClick(issue: LintIssue) {
  if (issue.blockId) emit('select', issue.blockId)
}

function fixAll() {
  emit('fix', 'Fix all outstanding review findings on this email: '
    + issues.value.filter(i => i.fixPrompt).map(i => i.message).join(' ')
    + ' Keep the layout and intent; only fix the problems.')
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-default px-4 py-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-scan-search" class="size-4 text-primary" />
        <span class="text-sm font-semibold text-highlighted">Review</span>
      </div>
      <UButton
        v-if="canAi && fixableCount > 1"
        label="Fix all with AI"
        icon="i-lucide-sparkles"
        size="xs"
        variant="soft"
        :disabled="aiBusy"
        @click="fixAll"
      />
    </div>

    <div class="flex-1 space-y-4 overflow-y-auto p-4 pc-scroll">
      <!-- all clear -->
      <div v-if="!issues.length" class="flex flex-col items-center justify-center py-12 text-center">
        <div class="grid place-items-center w-12 h-12 rounded-2xl bg-green-500/10 text-green-500">
          <UIcon name="i-lucide-check-check" class="size-6" />
        </div>
        <p class="mt-3 text-sm font-medium">All clear</p>
        <p class="mt-1 text-xs pc-dim">No deliverability, accessibility or content issues found.</p>
      </div>

      <template v-else>
        <div v-for="group in [{ label: 'Problems', items: errors, tone: 'error' }, { label: 'Suggestions', items: warnings, tone: 'warning' }]" :key="group.label">
          <template v-if="group.items.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide pc-dim">{{ group.label }}</div>
            <ul class="space-y-2">
              <li
                v-for="(issue, i) in group.items"
                :key="`${issue.code}-${issue.blockId ?? 'doc'}-${i}`"
                class="rounded-lg border pc-hairline p-3 transition"
                :class="issue.blockId ? 'cursor-pointer hover:border-primary/40' : ''"
                @click="onIssueClick(issue)"
              >
                <div class="flex items-start gap-2">
                  <UIcon
                    :name="group.tone === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-triangle-alert'"
                    class="mt-0.5 size-4 shrink-0"
                    :class="group.tone === 'error' ? 'text-red-500' : 'text-amber-500'"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-xs leading-5">{{ issue.message }}</p>
                    <div class="mt-1.5 flex items-center gap-2">
                      <UBadge v-if="issue.blockId" label="Show block" color="neutral" variant="soft" size="sm" />
                      <UButton
                        v-if="canAi && issue.fixPrompt"
                        label="Fix with AI"
                        icon="i-lucide-sparkles"
                        size="xs"
                        color="primary"
                        variant="ghost"
                        :disabled="aiBusy"
                        @click.stop="emit('fix', issue.fixPrompt!)"
                      />
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </template>
        </div>

        <p class="text-[11px] pc-dim">
          Checks run locally on every edit: subject &amp; preheader, dead links, placeholder images, alt text, color contrast, unsubscribe footer and email-safe HTML.
        </p>
      </template>
    </div>
  </div>
</template>
