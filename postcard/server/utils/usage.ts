/**
 * AI usage metering. Every assistant turn records token counts per user so the
 * account page can show consumption and the chat endpoint can enforce the
 * monthly message allowance for the user's plan.
 */
import { randomUUID } from 'node:crypto'
import { and, count, eq, gte, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { aiUsage } from '../db/schema'
import { planFor } from './plans'

/** Epoch ms at the start of the current calendar month (UTC). */
export function startOfMonth(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
}

export interface UsageRecord {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export async function recordUsage(
  userId: string,
  projectId: string | null,
  model: string | null,
  usage: UsageRecord
): Promise<void> {
  const prompt = usage.promptTokens ?? 0
  const completion = usage.completionTokens ?? 0
  const total = usage.totalTokens ?? prompt + completion
  await getDb().insert(aiUsage).values({
    id: randomUUID(),
    userId,
    projectId,
    model,
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    createdAt: Date.now()
  }).catch((e) => {
    console.error('[usage] recordUsage failed:', e instanceof Error ? e.message : e)
  })
}

/** Count assistant turns this user has spent so far this calendar month. */
export async function messagesThisMonth(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, startOfMonth())))
  return rows[0]?.n ?? 0
}

export interface UsageSummary {
  plan: string
  used: number
  limit: number
  remaining: number
  totalTokens: number
}

export async function usageSummary(userId: string, plan: string): Promise<UsageSummary> {
  const db = getDb()
  const since = startOfMonth()
  const rows = await db
    .select({
      used: count(),
      totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)`
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)))
  const used = Number(rows[0]?.used ?? 0)
  const limit = planFor(plan).limits.aiMessagesPerMonth
  return {
    plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    totalTokens: Number(rows[0]?.totalTokens ?? 0)
  }
}
