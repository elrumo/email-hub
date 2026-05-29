import type { Integration } from "../engine/types";

/**
 * Notifications. The connection holds the destination webhook so the same
 * Discord channel can be reused across flows. Ported from the legacy
 * server/utils/notify.ts (Discord webhook POST).
 */
export const notifyIntegration: Integration = {
  id: "notify",
  name: "Notifications",
  icon: "i-lucide-bell",
  connectionSchema: [
    {
      key: "webhookUrl",
      label: "Discord webhook URL",
      type: "secret",
      required: true,
      placeholder: "https://discord.com/api/webhooks/...",
      help: "Create one in your Discord channel settings → Integrations → Webhooks."
    }
  ],
  triggers: [],
  actions: [
    {
      id: "discord",
      name: "Send a Discord message",
      description: "Posts a message to the connected Discord channel.",
      needsConnection: true,
      inputSchema: [
        {
          key: "text",
          label: "Message",
          type: "string",
          required: true,
          placeholder: "Failed over app.example.com to the backup IP"
        }
      ],
      outputKeys: ["sent"],
      run: async (ctx) => {
        const webhookUrl = String(ctx.connection?.config.webhookUrl ?? "");
        const text = String(ctx.input.text ?? "");
        if (!webhookUrl) {
          ctx.log("no webhook configured; message not sent");
          return { sent: false };
        }
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
          signal: ctx.signal
        });
        const sent = res.ok;
        ctx.log(`discord → ${res.status}`);
        return { sent };
      }
    }
  ]
};
