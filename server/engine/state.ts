import { and, eq } from 'drizzle-orm'
import type { DB } from '../db'
import { flowState } from '../db/schema'

/**
 * Per-flow named state, backing the "state" step primitive and the
 * cooldown/threshold helpers. Keys may be scoped per-entity by the caller
 * (e.g. "failCount:host.example.com"). Values are numbers, strings or epoch-ms
 * timestamps stored as JSON.
 */
export class FlowStateStore {
  constructor(
    private db: DB,
    private flowId: string,
    private now: number
  ) {}

  async get(key: string): Promise<unknown> {
    const rows = await this.db
      .select()
      .from(flowState)
      .where(and(eq(flowState.flowId, this.flowId), eq(flowState.key, key)))
    return rows[0]?.value
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db
      .insert(flowState)
      .values({ flowId: this.flowId, key, value, updatedAt: this.now })
      .onConflictDoUpdate({
        target: [flowState.flowId, flowState.key],
        set: { value, updatedAt: this.now }
      })
  }

  async increment(key: string, by = 1): Promise<number> {
    const cur = Number((await this.get(key)) ?? 0) || 0
    const next = cur + by
    await this.set(key, next)
    return next
  }

  async reset(key: string): Promise<void> {
    await this.set(key, 0)
  }

  async stampNow(key: string): Promise<void> {
    await this.set(key, this.now)
  }

  /**
   * Cooldown gate: passes (true) when at least `windowMs` has elapsed since the
   * timestamp stored at `key` (or if no timestamp exists yet). Does NOT stamp —
   * the caller stamps explicitly when the guarded action actually fires.
   */
  async cooldownPassed(key: string, windowMs: number): Promise<boolean> {
    const last = Number((await this.get(key)) ?? 0) || 0
    return this.now - last >= windowMs
  }

  /** Threshold gate: passes when the counter at `key` is >= count. */
  async thresholdReached(key: string, count: number): Promise<boolean> {
    const cur = Number((await this.get(key)) ?? 0) || 0
    return cur >= count
  }
}
