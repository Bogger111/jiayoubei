import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { requireSession } from "@/lib/server/session";

/** POST /api/services — 添加服务资源 */
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
    const familyId = session.user.familyId;
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "请填写资源名称" }, { status: 400 });

    const db = getDb();
    const rows = await db.select({ id: schema.serviceProviders.id }).from(schema.serviceProviders).orderBy(desc(schema.serviceProviders.id)).limit(1);
    const maxN = rows.length ? Number(/^S(\d+)$/.exec(rows[0].id)?.[1] ?? 0) : 0;
    const serviceId = `S${String(maxN + 1).padStart(3, "0")}`;

    await db.insert(schema.serviceProviders).values({
      id: serviceId,
      familyId,
      name,
      category: String(body.category ?? "生活服务").trim(),
      coverage: String(body.coverage ?? "本地").trim(),
      contact: String(body.contact ?? "").trim(),
      lastUsed: "从未使用",
      trustLevel: "unverified",
      note: String(body.note ?? "成员手动添加，待验证").trim(),
    });
    return Response.json({ id: serviceId, name }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "添加失败" }, { status: 500 });
  }
}
