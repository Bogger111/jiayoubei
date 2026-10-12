import { privateJson } from "@/lib/server/json-response";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import {
  apiError,
  clearSessionCookie,
  requireSession,
} from "@/lib/server/session";
import { ensureProductSchema } from "@/lib/server/product-repo";

export async function POST(request: Request) {
  try {
    // 递增会话版本号，使该用户已签发的所有令牌立即失效（真登出）
    const session = await requireSession(request);
    if (session?.user) {
      await ensureProductSchema();
      await getDb().batch([
        getDb()
          .update(schema.users)
          .set({ sessionVersion: sql`session_version + 1` })
          .where(sql`id = ${session.user.id}`),
        getDb()
          .delete(schema.pushSubscriptions)
          .where(
            sql`user_id = ${session.user.id} AND family_id = ${session.user.familyId}`,
          ),
      ]);
    }
    const response = privateJson({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
