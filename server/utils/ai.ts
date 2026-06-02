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
import type { LanguageModel } from 'ai'

export function getAssistantModel(): { model: LanguageModel, modelId: string } {
  const cfg = useRuntimeConfig().ai
  const baseURL = (cfg.baseUrl || '').trim().replace(/\/$/, '')
  const modelId = cfg.model || 'mini-v2'

  const openai = createOpenAI({
    apiKey: cfg.apiKey || 'placeholder',
    ...(baseURL ? { baseURL } : {})
  })

  // Use the chat/completions surface — LiteLLM (and most gateways) speak it.
  return { model: openai.chat(modelId), modelId }
}
