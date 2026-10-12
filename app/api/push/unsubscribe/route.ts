import { privateJson } from "@/lib/server/json-response";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { apiError, requireSession } from "@/lib/server/session";
import { readObjectBody, inputText } from "@/lib/server/request-body";

/** POST /api/push/unsubscribe — 删除当前用户的推送订阅 */
export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    const session = await requireSession(request);
    if (!session?.user)
      return new Response(JSON.stringify({ error: "未登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    const payload = await readObjectBody(request);
    const endpoint = inputText(payload.endpoint, "订阅地址", 2000);

    const { getDb } = await import("@/db");
    const schemaModule = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");

    await getDb()
      .delete(schemaModule.pushSubscriptions)
      .where(
        and(
          eq(schemaModule.pushSubscriptions.endpoint, endpoint),
          eq(schemaModule.pushSubscriptions.familyId, session.user.familyId),
          eq(schemaModule.pushSubscriptions.userId, session.user.id),
        ),
      );
    return privateJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
