/**
 * Example declarative connectors — these reproduce existing built-in
 * integrations purely as data, proving the recipe format is expressive enough
 * for real connectors. They double as marketplace seed entries and as the
 * fixtures the connector smoke test runs against.
 *
 * Telegram / Mailgun / Discord port cleanly. Bunny `listRecords` is the case
 * that does NOT fully port: it needs to FILTER the response array (A-records
 * matching a name) and compute `activeIp`. The recipe can return the raw
 * `Records` array, but the filter/find belongs in a flow step (a `forEach` +
 * `condition`) — documented inline so the limit is explicit, not hidden.
 */

import type { ConnectorDef } from './types'

/** Telegram — full parity with server/integrations/telegram.ts sendMessage. */
export const telegramExample: ConnectorDef = {
  schemaVersion: 1,
  id: 'telegram-community',
  name: 'Telegram (community)',
  meta: { author: 'flow-hub', version: '1.0.0', description: 'Send Telegram messages via a bot.' },
  img: 'https://telegram.org/img/t_logo.svg',
  connectionSchema: [
    { key: 'botToken', label: 'Bot token', type: 'secret', required: true, placeholder: '123456:ABC-DEF...', help: 'Create a bot with @BotFather and paste the token.' }
  ],
  test: {
    request: { method: 'GET', url: 'https://api.telegram.org/bot{{connection.botToken}}/getMe' },
    okMessage: 'Connected to Telegram'
  },
  actions: [
    {
      id: 'sendMessage',
      name: 'Send a Telegram message',
      description: 'Sends a message to a chat via the connected bot.',
      needsConnection: true,
      inputSchema: [
        { key: 'chatId', label: 'Chat ID', type: 'string', required: true },
        { key: 'text', label: 'Message', type: 'string', required: true }
      ],
      request: {
        method: 'POST',
        url: 'https://api.telegram.org/bot{{connection.botToken}}/sendMessage',
        bodyType: 'json',
        body: { chat_id: '{{input.chatId}}', text: '{{input.text}}' }
      },
      output: { sent: '$ok', messageId: '$.result.message_id' }
    }
  ]
}

/** Mailgun — form-encoded body + Basic auth header (templated). */
export const mailgunExample: ConnectorDef = {
  schemaVersion: 1,
  id: 'mailgun-community',
  name: 'Mailgun (community)',
  meta: { author: 'flow-hub', version: '1.0.0' },
  img: 'https://www.mailgun.com/favicon.ico',
  connectionSchema: [
    { key: 'apiKey', label: 'API key', type: 'secret', required: true },
    { key: 'domain', label: 'Sending domain', type: 'string', required: true, placeholder: 'mg.example.com' },
    { key: 'fromEmail', label: 'Default "from" address', type: 'string', required: true }
  ],
  actions: [
    {
      id: 'sendEmail',
      name: 'Send an email',
      needsConnection: true,
      inputSchema: [
        { key: 'to', label: 'To', type: 'string', required: true },
        { key: 'subject', label: 'Subject', type: 'string', required: true },
        { key: 'text', label: 'Body (plain text)', type: 'string', required: true }
      ],
      request: {
        method: 'POST',
        // NOTE: the US base URL is hard-coded here; the built-in supports an EU
        // region toggle. A recipe could express that with a `select` field +
        // a templated host, e.g. https://api.{{connection.regionHost}}.mailgun.net
        url: 'https://api.mailgun.net/v3/{{connection.domain}}/messages',
        headers: {
          // Mailgun uses HTTP Basic "api:<key>". The recipe format has no
          // base64 helper, so the user provides a pre-encoded token, OR (better)
          // we add an `auth` helper to HttpRequestSpec later. Documented limit.
          Authorization: 'Basic {{connection.basicAuth}}'
        },
        bodyType: 'form',
        body: { from: '{{connection.fromEmail}}', to: '{{input.to}}', subject: '{{input.subject}}', text: '{{input.text}}' }
      },
      output: { sent: '$ok', id: '$.id' }
    }
  ]
}

/** Discord webhook — the simplest case; one templated POST. */
export const discordExample: ConnectorDef = {
  schemaVersion: 1,
  id: 'discord-community',
  name: 'Discord (community)',
  meta: { author: 'flow-hub', version: '1.0.0' },
  icon: 'i-simple-icons-discord',
  connectionSchema: [
    { key: 'webhookUrl', label: 'Discord webhook URL', type: 'secret', required: true }
  ],
  actions: [
    {
      id: 'send',
      name: 'Send a Discord message',
      needsConnection: true,
      inputSchema: [{ key: 'text', label: 'Message', type: 'string', required: true }],
      request: {
        method: 'POST',
        url: '{{connection.webhookUrl}}',
        bodyType: 'json',
        body: { content: '{{input.text}}' }
      },
      output: { sent: '$ok' }
    }
  ]
}

/** Bunny — the partial case: returns the raw Records array (no server-side filter). */
export const bunnyExample: ConnectorDef = {
  schemaVersion: 1,
  id: 'bunny-community',
  name: 'Bunny DNS (community)',
  meta: { author: 'flow-hub', version: '0.1.0', description: 'Read DNS zones. Filtering A-records is done in the flow.' },
  connectionSchema: [{ key: 'apiKey', label: 'Bunny API key', type: 'secret', required: true }],
  actions: [
    {
      id: 'getZone',
      name: 'Get a DNS zone',
      description: 'Returns the full zone incl. its Records array. Use a flow forEach+condition to pick a record.',
      needsConnection: true,
      inputSchema: [{ key: 'zoneId', label: 'Zone ID', type: 'number', required: true }],
      request: {
        method: 'GET',
        url: 'https://api.bunny.net/dnszone/{{input.zoneId}}',
        headers: { AccessKey: '{{connection.apiKey}}', Accept: 'application/json' }
      },
      output: { records: '$.Records', domain: '$.Domain' }
    }
  ]
}

export const exampleConnectors: ConnectorDef[] = [
  telegramExample,
  mailgunExample,
  discordExample,
  bunnyExample
]
