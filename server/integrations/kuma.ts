import type { Integration } from "../engine/types";

/**
 * Uptime Kuma. Reads the Prometheus /metrics endpoint (Basic auth with the
 * API key as the password). Ported from the legacy server/utils/kuma.ts.
 *
 * Status codes: 1 = up, 0 = down, 2 = pending, 3 = maintenance.
 */
async function fetchStatuses(
  baseUrl: string,
  apiKey: string,
  signal: AbortSignal
): Promise<Map<string, number>> {
  const url = baseUrl.replace(/\/$/, "") + "/metrics";
  const auth = "Basic " + Buffer.from(":" + apiKey).toString("base64");
  const res = await fetch(url, { headers: { Authorization: auth }, signal });
  if (!res.ok) throw new Error(`Kuma /metrics ${res.status}`);
  const text = await res.text();
  const statuses = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (!line.startsWith("monitor_status{")) continue;
    const nameMatch = line.match(/monitor_name="([^"]+)"/);
    const valMatch = line.match(/}\s+([0-9.eE+-]+)\s*$/);
    if (nameMatch && valMatch) {
      const v = Number(valMatch[1]);
      if (v === 0 || v === 1 || v === 2 || v === 3) statuses.set(nameMatch[1]!, v);
    }
  }
  return statuses;
}

export const kumaIntegration: Integration = {
  id: "kuma",
  name: "Uptime Kuma",
  icon: "i-simple-icons-uptimekuma",
  connectionSchema: [
    { key: "baseUrl", label: "Kuma URL", type: "string", required: true, placeholder: "https://status.example.com" },
    { key: "apiKey", label: "API key", type: "secret", required: true, help: "A Kuma API key with metrics access." }
  ],
  triggers: [
    {
      id: "monitorDown",
      name: "When a monitor is down",
      description: "Fires on each check while the chosen monitor reports DOWN.",
      kind: "poll",
      needsConnection: true,
      configSchema: [
        { key: "monitor", label: "Monitor name", type: "string", required: true, help: "Exact monitor name as it appears in Kuma." }
      ],
      poll: async (ctx) => {
        const cfg = ctx.connection!.config;
        const statuses = await fetchStatuses(
          String(cfg.baseUrl),
          String(cfg.apiKey),
          ctx.signal
        );
        const monitor = String(ctx.config.monitor ?? "");
        const status = statuses.get(monitor);
        if (status === undefined) return null; // monitor not found → don't fire
        if (status === 1) return null; // up → don't fire
        return { monitor, status, isDown: true };
      }
    }
  ],
  actions: [
    {
      id: "getMonitorStatus",
      name: "Get a monitor's status",
      description: "Returns the current status of a Kuma monitor (up/down/pending/maintenance).",
      needsConnection: true,
      inputSchema: [{ key: "monitor", label: "Monitor name", type: "string", required: true }],
      outputKeys: ["status", "statusText", "isUp", "isDown"],
      run: async (ctx) => {
        const cfg = ctx.connection!.config;
        const statuses = await fetchStatuses(String(cfg.baseUrl), String(cfg.apiKey), ctx.signal);
        const monitor = String(ctx.input.monitor ?? "");
        const status = statuses.get(monitor);
        const text =
          status === 1 ? "up" : status === 0 ? "down" : status === 2 ? "pending" : status === 3 ? "maintenance" : "unknown";
        ctx.log(`${monitor} → ${text}`);
        return { status: status ?? null, statusText: text, isUp: status === 1, isDown: status === 0 };
      }
    }
  ]
};
