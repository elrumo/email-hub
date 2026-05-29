import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { connections } from "../../db/schema";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const db = getDb();
  const rows = await db.select().from(connections).where(eq(connections.id, id));
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "connection not found" });
  // machines cascade-delete via FK
  await db.delete(connections).where(eq(connections.id, id));
  return { id, deleted: true };
});
