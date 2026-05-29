import type { Integration } from "../engine/types";

/**
 * Dokploy. The connection is one Dokploy instance (baseUrl + API token).
 *
 * Machine metrics come from `server.getServerMetrics`, which proxies the
 * monitoring agent and requires query params url/token/dataPoints (the url+token
 * come from Dokploy's per-server monitoring setup). The response is a time-series
 * object with cpu/memory/disk/network/block arrays of {value, time}. We surface
 * the LATEST disk sample as flat fields for easy use:
 *   diskFree, diskTotal, diskUsage, diskUsedPercentage   (all GB / %)
 * (field names confirmed from Dokploy source packages/server/src/monitoring/utils.ts)
 */

interface DiskSampleValue {
  diskTotal: number;
  diskUsage: number;
  diskFree: number;
  diskUsedPercentage: number;
}
type Sample<T> = { value: T; time: string | number };

function authHeaders(token: string): Record<string, string> {
  // Dokploy accepts the API token via the Authorization header (x-api-key on
  // some versions); send both to be safe.
  return { Authorization: token, "x-api-key": token, Accept: "application/json" };
}

function base(ctx: { connection: { config: Record<string, unknown> } | null }): string {
  const url = String(ctx.connection?.config.baseUrl ?? "").replace(/\/$/, "");
  if (!url) throw new Error("Dokploy connection has no base URL");
  return url;
}

export const dokployIntegration: Integration = {
  id: "dokploy",
  name: "Dokploy",
  icon: "i-simple-icons-dokploy",
  connectionSchema: [
    { key: "baseUrl", label: "Dokploy URL", type: "string", required: true, placeholder: "https://dokploy.example.com" },
    { key: "apiToken", label: "API token", type: "secret", required: true, help: "From Dokploy → Settings → API/Tokens." }
  ],
  triggers: [],
  actions: [
    {
      id: "getServerMetrics",
      name: "Get machine metrics (disk/CPU/memory)",
      description:
        "Fetches the latest server metrics from Dokploy monitoring. Reports free disk space, CPU and memory.",
      needsConnection: true,
      inputSchema: [
        { key: "metricsUrl", label: "Monitoring URL", type: "string", required: true, help: "From the machine's monitoring setup." },
        { key: "metricsToken", label: "Monitoring token", type: "secret", required: true },
        { key: "dataPoints", label: "Data points", type: "string", default: "50" }
      ],
      outputKeys: ["diskFree", "diskTotal", "diskUsage", "diskUsedPercentage", "raw"],
      run: async (ctx) => {
        const token = String(ctx.connection!.config.apiToken ?? "");
        const q = new URLSearchParams({
          url: String(ctx.input.metricsUrl ?? ""),
          token: String(ctx.input.metricsToken ?? ""),
          dataPoints: String(ctx.input.dataPoints ?? "50")
        });
        const res = await fetch(`${base(ctx)}/api/server.getServerMetrics?${q}`, {
          headers: authHeaders(token),
          signal: ctx.signal
        });
        if (!res.ok) throw new Error(`Dokploy getServerMetrics: ${res.status}`);
        const raw = (await res.json()) as { disk?: Sample<DiskSampleValue>[] };
        const disk = raw.disk ?? [];
        const latest = disk.length ? disk[disk.length - 1]!.value : undefined;
        ctx.log(`disk: ${latest ? `${latest.diskFree}GB free of ${latest.diskTotal}GB` : "no data"}`);
        return {
          diskFree: latest?.diskFree ?? null,
          diskTotal: latest?.diskTotal ?? null,
          diskUsage: latest?.diskUsage ?? null,
          diskUsedPercentage: latest?.diskUsedPercentage ?? null,
          raw
        };
      }
    },
    {
      id: "getDockerDiskUsage",
      name: "Get Docker disk usage",
      description: "Returns Docker's disk usage on the Dokploy host (like `docker system df`).",
      needsConnection: true,
      inputSchema: [],
      outputKeys: ["raw"],
      run: async (ctx) => {
        const token = String(ctx.connection!.config.apiToken ?? "");
        const res = await fetch(`${base(ctx)}/api/settings.getDockerDiskUsage`, {
          headers: authHeaders(token),
          signal: ctx.signal
        });
        if (!res.ok) throw new Error(`Dokploy getDockerDiskUsage: ${res.status}`);
        const raw = await res.json();
        return { raw };
      }
    }
  ]
};
