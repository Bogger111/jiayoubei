import { privateJson } from "@/lib/server/json-response";
import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { ensureProductSchema } from "@/lib/server/product-repo";

export async function GET() {
  const workerEnv = env as unknown as Record<string, unknown>;
  if ((workerEnv.AUTH_MODE ?? "demo") !== "real") {
    return privateJson({ needsSetup: false, authMode: "demo" });
  }
  await ensureProductSchema();
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(sql`password_hash IS NOT NULL`)
    .limit(1);
  return privateJson({ needsSetup: rows.length === 0, authMode: "real" });
}
