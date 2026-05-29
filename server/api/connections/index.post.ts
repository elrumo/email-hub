import { randomUUID } from "node:crypto";
import { getDb } from "../../db";
import { connections } from "../../db/schema";
import { getIntegration } from "../../engine/registry";
import { validateAgainstSchema } from "../../engine/validate";
import { registerAllIntegrations } from "../../integrations";

export default defineEventHandler(async (event) => {
  registerAllIntegrations();
  const body = await readBody(event);
  const integrationId = String(body?.integrationId ?? "");
  const name = String(body?.name ?? "").trim();

  const integration = getIntegration(integrationId);
  if (!integration) {
    throw createError({ statusCode: 400, statusMessage: `unknown integration: ${integrationId}` });
  }
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "name is required" });
  }

  const validated = validateAgainstSchema(body?.config ?? {}, integration.connectionSchema);
  if (!validated.ok) {
    throw createError({ statusCode: 400, statusMessage: validated.error });
  }

  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  try {
    await db.insert(connections).values({
      id,
      integrationId,
      name,
      config: validated.value,
      createdAt: now,
      updatedAt: now
    });
  } catch {
    throw createError({ statusCode: 409, statusMessage: `a ${integrationId} connection named "${name}" already exists` });
  }

  setResponseStatus(event, 201);
  return { id, integrationId, name };
});
