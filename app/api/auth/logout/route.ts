import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { clearSessionCookie, requireSession } from "@/lib/server/session";

export async function POST(request: Request) {
  // 递增会话版本号，使该用户已签发的所有令牌立即失效（真登出）
  const session = await requireSession(request);
  if (session?.user) {
    await getDb().update(schema.users).set({ sessionVersion: sql`session_version + 1` }).where(sql`id = ${session.user.id}`);
  }
  const response = Response.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
