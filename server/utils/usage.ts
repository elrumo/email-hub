import { countAiUsageSince, recordAiUsage, summarizeAiUsage } from './parse'
import { planFor } from './plans'

export function startOfMonth(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
}

export interface UsageRecord {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export async function recordUsageForUser(
  userId: string,
  projectId: string | null,
  model: string | null,
  usage: UsageRecord
): Promise<void> {
  const prompt = usage.promptTokens ?? 0
  const completion = usage.completionTokens ?? 0
  const total = usage.totalTokens ?? prompt + completion
  await recordAiUsage({
    userId,
    projectId,
    model,
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total
  }).catch((e) => {
    console.error('[usage] recordUsage failed:', e instanceof Error ? e.message : e)
  })
}

export async function messagesThisMonth(userId: string): Promise<number> {
  return countAiUsageSince(userId, startOfMonth())
}

export interface UsageSummary {
  plan: string
  used: number
  limit: number
  remaining: number
  totalTokens: number
}

export async function usageSummary(userId: string, plan: string): Promise<UsageSummary> {
  const { used, totalTokens } = await summarizeAiUsage(userId, startOfMonth())
  const limit = planFor(plan).limits.aiMessagesPerMonth
  return {
    plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    totalTokens
  }
}
