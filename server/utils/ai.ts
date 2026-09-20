/**
 * The assistant's model — resolved server-side only.
 *
 * Postcard presents a single branded assistant ("Postcard AI"). Behind it is a
 * LiteLLM gateway that speaks the OpenAI dialect and exposes the model alias
 * `mini-v2`. The concrete provider/model is an implementation detail configured
 * via env + litellm.config.yaml and is NEVER sent to the client. Keep all of
 * this in server code; do not echo `model`/`baseUrl` in any API response.
 */
import { createOpenAI } from '@ai-sdk/openai'
import { createError } from 'h3'
import type { LanguageModel } from 'ai'

/**
 * Whether an AI provider is wired up. Postcard talks to any OpenAI-compatible
 * endpoint: set NUXT_AI_API_KEY (OpenAI directly) and/or NUXT_AI_BASE_URL (a
 * self-hosted gateway such as LiteLLM or Ollama that may not need a key). With
 * neither set, the assistant is disabled and callers surface a clear message
 * rather than failing an upstream call with a placeholder key.
 */
export function aiConfigured(): boolean {
  const cfg = useRuntimeConfig().ai
  return !!(cfg.apiKey || cfg.baseUrl)
}

/** Throws a friendly 501 when no AI provider is configured on this instance. */
export function assertAiConfigured(): void {
  if (!aiConfigured()) {
    throw createError({
      statusCode: 501,
      statusMessage: 'The AI assistant is not configured on this instance. Set NUXT_AI_API_KEY (or NUXT_AI_BASE_URL) to enable it.'
    })
  }
}

export function getAssistantModel(): { model: LanguageModel, modelId: string } {
  const cfg = useRuntimeConfig().ai
  const baseURL = (cfg.baseUrl || '').trim().replace(/\/$/, '')
  const modelId = cfg.model || 'gpt-4o-mini'

  const openai = createOpenAI({
    apiKey: cfg.apiKey || 'placeholder',
    ...(baseURL ? { baseURL } : {})
  })

  // Use the chat/completions surface — LiteLLM (and most gateways) speak it.
  return { model: openai.chat(modelId), modelId }
}
