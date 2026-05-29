import type { Integration } from '../engine/types'

/**
 * Telegram Bot API. The connection holds a bot token; each message action takes
 * a chat id. To find your chat id: message your bot, then read it from
 * https://api.telegram.org/bot<token>/getUpdates — the `testConnection` below
 * surfaces the most recent chat id it can see to make this less painful.
 */
const API = 'https://api.telegram.org'

function token(config: Record<string, unknown>): string {
  const t = String(config.botToken ?? '')
  if (!t) throw new Error('Telegram connection has no bot token')
  return t
}

async function call<T = unknown>(
  botToken: string,
  method: string,
  body: Record<string, unknown> | null,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch(`${API}/bot${botToken}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal
  })
  const data = await res.json().catch(() => null) as { ok?: boolean, result?: T, description?: string } | null
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} → ${res.status}`)
  }
  return data.result as T
}

export const telegramIntegration: Integration = {
  id: 'telegram',
  name: 'Telegram',
  img: 'https://telegram.org/img/t_logo.svg',
  connectionSchema: [
    {
      key: 'botToken',
      label: 'Bot token',
      type: 'secret',
      required: true,
      placeholder: '123456:ABC-DEF...',
      help: 'Create a bot with @BotFather and paste the token it gives you.'
    }
  ],
  testConnection: async (config, signal) => {
    const botToken = String(config.botToken ?? '')
    if (!botToken) return { ok: false, message: 'Bot token is required' }
    try {
      const me = await call<{ username?: string }>(botToken, 'getMe', null, signal)
      // try to surface a chat id from recent updates to help the user
      let hint = ''
      try {
        const updates = await call<Array<{ message?: { chat?: { id?: number, title?: string, username?: string } } }>>(
          botToken, 'getUpdates', null, signal
        )
        const chat = updates.map(u => u.message?.chat).filter(Boolean).at(-1)
        if (chat?.id) hint = ` — recent chat id: ${chat.id}${chat.title || chat.username ? ` (${chat.title || chat.username})` : ''}`
      } catch { /* getUpdates is best-effort */ }
      return { ok: true, message: `Connected as @${me.username ?? 'bot'}${hint}` }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach Telegram'
      return { ok: false, message: /401|unauthorized/i.test(msg) ? 'Bot token rejected' : msg }
    }
  },
  triggers: [],
  actions: [
    {
      id: 'sendMessage',
      name: 'Send a Telegram message',
      description: 'Sends a message to a chat via the connected bot.',
      needsConnection: true,
      inputSchema: [
        { key: 'chatId', label: 'Chat ID', type: 'string', required: true, help: 'Numeric chat id or @channelusername. The Test button shows recent chat ids.' },
        { key: 'text', label: 'Message', type: 'string', required: true, placeholder: 'Failover complete on app.example.com' },
        { key: 'parseMode', label: 'Formatting', type: 'select', default: 'none', options: [
          { label: 'Plain text', value: 'none' },
          { label: 'Markdown', value: 'MarkdownV2' },
          { label: 'HTML', value: 'HTML' }
        ] }
      ],
      outputKeys: ['sent', 'messageId'],
      run: async (ctx) => {
        const botToken = token(ctx.connection!.config)
        const parseMode = String(ctx.input.parseMode ?? 'none')
        const result = await call<{ message_id?: number }>(botToken, 'sendMessage', {
          chat_id: String(ctx.input.chatId ?? ''),
          text: String(ctx.input.text ?? ''),
          ...(parseMode !== 'none' ? { parse_mode: parseMode } : {})
        }, ctx.signal)
        ctx.log(`telegram → chat ${ctx.input.chatId} (msg ${result.message_id})`)
        return { sent: true, messageId: result.message_id ?? null }
      }
    }
  ]
}
