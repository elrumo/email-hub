import { sendPush } from '../utils/push'
import type { Integration } from '../engine/types'

/**
 * Browser (Web Push) notifications. Unlike most integrations this needs no
 * connection — a notification fans out to every browser/device that has opted
 * in via the bell toggle in the header (stored in push_subscriptions). The
 * heavy lifting (VAPID signing, fan-out, pruning dead subscriptions) lives in
 * server/utils/push.ts, shared with the per-flow "notify on run" setting.
 */
export const browserIntegration: Integration = {
  id: 'browser',
  name: 'Browser notification',
  icon: 'i-lucide-bell-ring',
  // No credentials: subscriptions are managed per-device, not per-connection.
  connectionSchema: [],
  triggers: [],
  actions: [
    {
      id: 'notify',
      name: 'Send a browser notification',
      description: 'Pushes a notification to every browser that has enabled notifications for this app.',
      needsConnection: false,
      inputSchema: [
        {
          key: 'title',
          label: 'Title',
          type: 'string',
          required: true,
          placeholder: 'Flow finished'
        },
        {
          key: 'body',
          label: 'Message',
          type: 'string',
          required: true,
          placeholder: 'Failed over app.example.com to the backup IP'
        },
        {
          key: 'url',
          label: 'Open on click (optional)',
          type: 'string',
          placeholder: '/flows',
          help: 'A path or URL the notification opens when tapped. Defaults to the app home.'
        }
      ],
      outputKeys: ['sent', 'pruned'],
      run: async (ctx) => {
        const title = String(ctx.input.title ?? '').trim() || 'Flow Hub'
        const body = String(ctx.input.body ?? '')
        const url = String(ctx.input.url ?? '').trim() || undefined
        const result = await sendPush({ title, body, url, tag: 'flow-action' })
        ctx.log(`browser push → ${result.sent} sent, ${result.pruned} pruned, ${result.failed} failed`)
        return { sent: result.sent, pruned: result.pruned }
      }
    }
  ]
}
