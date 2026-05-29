/**
 * Bridge the app's stored "AI" connection (server/integrations/ai.ts) to a
 * Vercel AI SDK `LanguageModel`, so the email designer's chat route can use
 * `streamText` / tool calling while still honouring whatever provider the user
 * configured on the Connections page (OpenAI, Anthropic, LiteLLM, a local
 * OpenAI-compatible endpoint, etc.).
 *
 * The AI integration stores its provider + apiKey + baseUrl in the connection's
 * `config`. We map that to either `@ai-sdk/openai` (for openai-dialect
 * providers) or `@ai-sdk/anthropic`, pointing each at the right base URL and
 * auth. This keeps a single source of truth for AI credentials across the
 * flow engine and the email designer.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { connections } from '../db/schema'

type Dialect = 'openai' | 'anthropic'

const PROVIDER_DIALECT: Record<string, Dialect> = {
  'openai': 'openai',
  'anthropic': 'anthropic',
  'litellm': 'openai',
  'openai-compatible': 'openai',
  'anthropic-compatible': 'anthropic',
  'lmstudio': 'openai'
}

const DEFAULT_BASE_URL: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  lmstudio: 'http://localhost:1234/v1'
}

export interface ResolvedAiModel {
  model: LanguageModel
  /** the model id string the user configured as a default, if any */
  defaultModel: string
  connectionName: string
}

/**
 * Load an AI connection (by id, or the first one if no id given) and build an
 * AI SDK model from it. Throws a friendly error if no AI connection exists or
 * no model can be determined — surfaced to the chat UI so the user knows to set
 * one up on the Connections page.
 */
export async function resolveAiModel(connectionId?: string | null): Promise<ResolvedAiModel> {
  const db = getDb()
  const rows = connectionId
    ? await db.select().from(connections).where(eq(connections.id, connectionId))
    : await db.select().from(connections).where(eq(connections.integrationId, 'ai'))

  const row = rows.find(r => r.integrationId === 'ai') ?? rows[0]
  if (!row || row.integrationId !== 'ai') {
    throw createError({
      statusCode: 400,
      statusMessage: 'No AI connection configured. Add one on the Connections page first.'
    })
  }

  const config = row.config as Record<string, unknown>
  const providerId = String(config.provider ?? 'openai')
  const dialect = PROVIDER_DIALECT[providerId] ?? 'openai'
  const apiKey = String(config.apiKey ?? '')
  const baseURL = (String(config.baseUrl ?? '').trim().replace(/\/$/, '')) || DEFAULT_BASE_URL[providerId] || ''
  const defaultModel = String(config.defaultModel ?? '')

  let model: LanguageModel
  if (dialect === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: apiKey || 'placeholder',
      ...(baseURL ? { baseURL } : {})
    })
    model = anthropic(defaultModel || 'claude-3-5-sonnet-latest')
  } else {
    const openai = createOpenAI({
      apiKey: apiKey || 'placeholder',
      ...(baseURL ? { baseURL } : {})
    })
    // Use the chat/completions surface (`.chat`) rather than the Responses API,
    // since most OpenAI-compatible gateways (LiteLLM, LM Studio) only speak it.
    model = openai.chat(defaultModel || 'gpt-4o-mini')
  }

  return { model, defaultModel, connectionName: row.name }
}
