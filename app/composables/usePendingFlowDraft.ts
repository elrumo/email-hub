import type { FlowDraft } from '~/types'

/**
 * Carries an AI-proposed flow from the flow-list launcher to the builder on the
 * "New flow" page. The list stashes a draft and navigates to /flows/new, which
 * consumes it once (and clears it) so a refresh starts blank.
 */
export const usePendingFlowDraft = () => useState<FlowDraft | null>('pendingFlowDraft', () => null)
