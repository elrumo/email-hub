import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import type { EmailDocument } from '#shared/email/blocks'

/**
 * A registered account. Auth is email + password (argon2id via Bun.password).
 * Billing state is denormalized onto the user: `plan` is the entitlement the
 * rest of the app reads (free | starter | pro), kept in sync with Stripe by the
 * webhook. `role` gates the (optional) admin surface.
 */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    /** argon2id hash (full encoded string from Bun.password.hash) */
    passwordHash: text('password_hash').notNull(),
    /** "admin" | "user" */
    role: text('role').notNull().default('user'),
    /** entitlement: "free" | "starter" | "pro" — source of truth for limits */
    plan: text('plan').notNull().default('free'),
    /** Stripe linkage, set lazily on first checkout */
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    /** mirror of the Stripe subscription status (active, trialing, past_due…) */
    planStatus: text('plan_status'),
    lastLoginAt: bigint('last_login_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
  },
  t => [uniqueIndex('users_email_uq').on(t.email)]
)

/** Opaque server-side session token stored in the `pc_session` cookie. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    userAgent: text('user_agent'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
  },
  t => [index('sessions_user_idx').on(t.userId)]
)

/**
 * An email design project owned by a user. `document` is the typed block tree
 * (see shared/email/blocks.ts) rendered to email-safe HTML by the renderer.
 * `variables` declares the mustache placeholders ({{ name }}) the template
 * exposes, with default values used for previews and as fallbacks when the API
 * renders without a supplied value.
 */
export const emailProjects = pgTable(
  'email_projects',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    /** JSON EmailDocument: { settings, blocks: [...] } */
    document: jsonb('document').notNull().$type<EmailDocument>(),
    /** declared template variables: [{ key, label?, defaultValue? }] */
    variables: jsonb('variables').notNull().default([]).$type<TemplateVariable[]>(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
  },
  t => [
    index('email_projects_owner_idx').on(t.ownerId),
    index('email_projects_updated_idx').on(t.updatedAt)
  ]
)

/** One AI chat message (Vercel AI SDK UIMessage shape) for a project. */
export const emailChatMessages = pgTable(
  'email_chat_messages',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    /** "user" | "assistant" | "system" */
    role: text('role').notNull(),
    parts: jsonb('parts').notNull().$type<unknown[]>(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
  },
  t => [index('email_chat_messages_project_idx').on(t.projectId, t.createdAt)]
)

/**
 * A personal API key for the public REST API. Only the hash is stored; the
 * plaintext is shown to the user exactly once at creation. `prefix` is the
 * non-secret leading segment used to display/identify the key.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    /** display-only leading segment, e.g. "pc_live_AbCd" */
    prefix: text('prefix').notNull(),
    /** sha-256 hash of the full secret */
    hash: text('hash').notNull(),
    lastUsedAt: bigint('last_used_at', { mode: 'number' }),
    revokedAt: bigint('revoked_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
  },
  t => [
    index('api_keys_owner_idx').on(t.ownerId),
    uniqueIndex('api_keys_hash_uq').on(t.hash)
  ]
)

/**
 * Per-call AI usage record. One row per assistant turn, capturing token counts
 * so usage can be metered per user (account page) and enforced against plan
 * limits. The model id is recorded internally but never surfaced to users.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    projectId: text('project_id'),
    /** internal model id (not shown to users) */
    model: text('model'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull()
  },
  t => [
    index('ai_usage_user_idx').on(t.userId),
    index('ai_usage_created_idx').on(t.createdAt)
  ]
)

export interface TemplateVariable {
  /** the {{ key }} used in the template */
  key: string
  /** human label shown in the editor */
  label?: string
  /** default/sample value used in previews and as API fallback */
  defaultValue?: string
}

export type UserRow = typeof users.$inferSelect
export type NewUserRow = typeof users.$inferInsert
export type SessionRow = typeof sessions.$inferSelect
export type EmailProjectRow = typeof emailProjects.$inferSelect
export type NewEmailProjectRow = typeof emailProjects.$inferInsert
export type EmailChatMessageRow = typeof emailChatMessages.$inferSelect
export type ApiKeyRow = typeof apiKeys.$inferSelect
export type AiUsageRow = typeof aiUsage.$inferSelect
