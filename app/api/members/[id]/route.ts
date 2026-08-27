import { requireSession } from "@/lib/server/session";

/** PATCH /api/members/[id] — 编辑家庭成员资料 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  try {
    const payload = await request.json() as { name?: string; relation?: string; role?: string; phone?: string };
    const { getDb } = await import("@/db");
    const db = getDb();
    const existing = await db.$client.prepare("SELECT id FROM family_members WHERE id = ? AND family_id = ?").bind(id, session.user.familyId).first<{ id: string }>();
    if (!existing) return Response.json({ error: "成员不存在" }, { status: 404 });
    await db.$client.prepare(
      "UPDATE family_members SET name = COALESCE(?, name), relation = COALESCE(?, relation), role = COALESCE(?, role), phone = COALESCE(?, phone) WHERE id = ?"
    ).bind(
      payload.name?.trim() || null,
      payload.relation?.trim() || null,
      payload.role?.trim() || null,
      payload.phone?.trim() || null,
      id
    ).run();
    const updated = await db.$client.prepare("SELECT * FROM family_members WHERE id = ?").bind(id).first<Record<string, unknown>>();
    return Response.json({ ok: true, member: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新成员失败" }, { status: 500 });
  }
}
