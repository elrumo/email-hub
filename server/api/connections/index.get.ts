import { getDb } from "../../db";
import { connections } from "../../db/schema";
import { getIntegration } from "../../engine/registry";
import { registerAllIntegrations } from "../../integrations";

/**
 * List connections. Secret fields are redacted (replaced with a "set" marker)
 * so tokens never leave the server in plaintext to the client.
 */
export default defineEventHandler(async () => {
  registerAllIntegrations();
  const db = getDb();
  const rows = await db.select().from(connections);
  return rows.map((row) => {
    const integration = getIntegration(row.integrationId);
    const secretKeys = new Set(
      (integration?.connectionSchema ?? [])
        .filter((f) => f.type === "secret")
        .map((f) => f.key)
    );
    const safeConfig: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row.config)) {
      safeConfig[k] = secretKeys.has(k) ? (v ? "••••••" : "") : v;
    }
    return {
      id: row.id,
      integrationId: row.integrationId,
      name: row.name,
      config: safeConfig,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  });
});
