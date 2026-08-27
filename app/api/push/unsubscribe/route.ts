import { ensureProductSchema } from "@/lib/server/product-repo";
import { apiError, requireSession } from "@/lib/server/session";

/** POST /api/push/unsubscribe — 删除当前用户的推送订阅 */
export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    const session = await requireSession(request);
    if (!session?.user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: { "Content-Type": "application/json" } });

    const payload = (await request.json()) as { endpoint?: unknown };
    const endpoint = typeof payload.endpoint === "string" ? payload.endpoint : "";
    if (!endpoint) return Response.json({ error: "缺少 endpoint" }, { status: 400 });

    const { getDb } = await import("@/db");
    const schemaModule = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await getDb().delete(schemaModule.pushSubscriptions).where(eq(schemaModule.pushSubscriptions.endpoint, endpoint));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
