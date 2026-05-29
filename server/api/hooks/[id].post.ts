import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { flows } from "../../db/schema";
import { executeFlow } from "../../engine/service";
import { registerAllIntegrations } from "../../integrations";
import type { FlowDefinition } from "../../engine/types";

/**
 * Inbound webhook trigger. Authenticated by a per-flow secret (NOT the UI auth,
 * which this route is exempt from — see server/middleware/auth.ts). The secret
 * lives in the flow's trigger config (`webhookSecret`) and must be supplied via
 * the `secret` query param or `x-webhook-secret` header.
 *
 * The request body is exposed to the flow as {{ trigger.* }}.
 */
export default defineEventHandler(async (event) => {
  registerAllIntegrations();
  const id = getRouterParam(event, "id")!;
  const db = getDb();
  const rows = await db.select().from(flows).where(eq(flows.id, id));
  const flow = rows[0];
  if (!flow) throw createError({ statusCode: 404, statusMessage: "flow not found" });
  if (!flow.enabled) throw createError({ statusCode: 403, statusMessage: "flow is disabled" });

  const def = flow.definition as FlowDefinition;
  const expected = String(def?.trigger?.config?.webhookSecret ?? "");
  if (!expected) {
    throw createError({ statusCode: 400, statusMessage: "this flow is not configured for webhooks" });
  }
  const provided =
    String(getQuery(event).secret ?? "") || getRequestHeader(event, "x-webhook-secret") || "";
  if (provided !== expected) {
    throw createError({ statusCode: 401, statusMessage: "invalid webhook secret" });
  }

  const body = await readBody(event).catch(() => ({}));
  const payload = body && typeof body === "object" ? body : {};
  return await executeFlow(id, "webhook", payload as Record<string, unknown>);
});
