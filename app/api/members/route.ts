import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { requireSession } from "@/lib/server/session";

/** POST /api/members — 添加家庭成员 */
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
    const familyId = session.user.familyId;
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "请填写姓名" }, { status: 400 });

    const db = getDb();
    const rows = await db.select({ id: schema.familyMembers.id }).from(schema.familyMembers).orderBy(desc(schema.familyMembers.id)).limit(1);
    const maxN = rows.length ? Number(/^M(\d+)$/.exec(rows[0].id)?.[1] ?? 0) : 0;
    const memberId = `M${String(maxN + 1).padStart(3, "0")}`;

    await db.insert(schema.familyMembers).values({
      id: memberId,
      familyId,
      name,
      relation: String(body.relation ?? "家庭成员").trim(),
      role: String(body.role ?? "家庭成员").trim(),
      avatar: String(body.avatar ?? "").trim().slice(0, 1) || name.slice(0, 1),
      location: String(body.location ?? "家中").trim(),
      phone: String(body.phone ?? "").trim(),
      permissions: "[\"view\"]",
      currentTaskId: null,
    });
    return Response.json({ id: memberId, name }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "添加失败" }, { status: 500 });
  }
}
