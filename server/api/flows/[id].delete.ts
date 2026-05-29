import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { flows } from "../../db/schema";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const db = getDb();
  const rows = await db.select().from(flows).where(eq(flows.id, id));
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "flow not found" });
  // flow_runs and flow_state cascade-delete via FK
  await db.delete(flows).where(eq(flows.id, id));
  return { id, deleted: true };
});
