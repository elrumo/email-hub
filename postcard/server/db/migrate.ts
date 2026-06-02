/**
 * Schema bootstrap. Rather than ship drizzle-kit at runtime, the canonical
 * tables are created idempotently on boot (CREATE TABLE/INDEX IF NOT EXISTS).
 * This keeps a fresh container — or a developer's first `bun dev` against an
 * empty Postgres — working with zero manual steps. `drizzle-kit generate`
 * remains available for authoring versioned migrations as the schema evolves.
 */
import { getClient } from './index'

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    email text NOT NULL,
    name text,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'user',
    plan text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    plan_status text,
    last_login_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email)`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    expires_at bigint NOT NULL,
    user_agent text,
    created_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,

  `CREATE TABLE IF NOT EXISTS email_projects (
    id text PRIMARY KEY,
    owner_id text NOT NULL,
    name text NOT NULL,
    document jsonb NOT NULL,
    variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS email_projects_owner_idx ON email_projects (owner_id)`,
  `CREATE INDEX IF NOT EXISTS email_projects_updated_idx ON email_projects (updated_at)`,

  `CREATE TABLE IF NOT EXISTS email_chat_messages (
    id text PRIMARY KEY,
    project_id text NOT NULL,
    role text NOT NULL,
    parts jsonb NOT NULL,
    created_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS email_chat_messages_project_idx ON email_chat_messages (project_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS api_keys (
    id text PRIMARY KEY,
    owner_id text NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    hash text NOT NULL,
    last_used_at bigint,
    revoked_at bigint,
    created_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS api_keys_owner_idx ON api_keys (owner_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_uq ON api_keys (hash)`,

  `CREATE TABLE IF NOT EXISTS ai_usage (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    project_id text,
    model text,
    prompt_tokens integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    total_tokens integer NOT NULL DEFAULT 0,
    created_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage (user_id)`,
  `CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at)`
]

let _done: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  if (!_done) {
    _done = (async () => {
      const client = getClient()
      for (const stmt of STATEMENTS) {
        await client.unsafe(stmt)
      }
    })().catch((e) => {
      _done = null // allow a later retry
      throw e
    })
  }
  return _done
}
