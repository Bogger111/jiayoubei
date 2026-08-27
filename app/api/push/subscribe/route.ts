import { ensureProductSchema } from "@/lib/server/product-repo";
import { apiError, requireSession } from "@/lib/server/session";

/** POST /api/push/subscribe — 保存当前用户的 Web Push 订阅 */
export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    const session = await requireSession(request);
    if (!session?.user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: { "Content-Type": "application/json" } });

    const payload = (await request.json()) as { endpoint?: unknown; p256dh?: unknown; auth?: unknown };
    const endpoint = typeof payload.endpoint === "string" ? payload.endpoint : "";
    const p256dh = typeof payload.p256dh === "string" ? payload.p256dh : "";
    const auth = typeof payload.auth === "string" ? payload.auth : "";
    if (!endpoint || !p256dh || !auth) {
      return Response.json({ error: "订阅信息不完整" }, { status: 400 });
    }

    const { getDb } = await import("@/db");
    const schemaModule = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const existing = await getDb().select().from(schemaModule.pushSubscriptions).where(eq(schemaModule.pushSubscriptions.endpoint, endpoint)).limit(1);
    if (existing.length > 0) {
      return Response.json({ ok: true, updated: false });
    }

    await getDb().insert(schemaModule.pushSubscriptions).values({
      id: `PS${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      userId: session.user.id,
      familyId: session.user.familyId,
      endpoint, p256dh, auth,
      userAgent: request.headers.get("User-Agent")?.slice(0, 200) ?? "",
      createdAt: new Date().toISOString(),
    });
    return Response.json({ ok: true, updated: true });
  } catch (error) {
    return apiError(error);
  }
}
