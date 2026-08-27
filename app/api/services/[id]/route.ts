import { requireSession } from "@/lib/server/session";

/** PATCH /api/services/[id] — 更新服务资源（验证状态等） */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  try {
    const payload = await request.json() as { verified?: boolean; note?: string; contact?: string };
    const { getDb } = await import("@/db");
    const db = getDb();
    const existing = await db.$client.prepare("SELECT id FROM service_providers WHERE id = ? AND family_id = ?").bind(id, session.user.familyId).first<{ id: string }>();
    if (!existing) return Response.json({ error: "资源不存在" }, { status: 404 });
    await db.$client.prepare(
      "UPDATE service_providers SET verified = COALESCE(?, verified), note = COALESCE(?, note), contact = COALESCE(?, contact) WHERE id = ?"
    ).bind(
      payload.verified === undefined ? null : payload.verified ? 1 : 0,
      payload.note ?? null,
      payload.contact ?? null,
      id
    ).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新资源失败" }, { status: 500 });
  }
}
