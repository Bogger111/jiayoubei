import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { requireSession } from "@/lib/server/session";

const KINDS = ["security", "environment", "lighting", "lock", "camera", "health", "other"];

/** POST /api/devices — 添加设备（模拟设备，供演示体验） */
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
    const familyId = session.user.familyId;
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "请填写设备名称" }, { status: 400 });
    const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : "other";

    const db = getDb();
    const rows = await db.select({ id: schema.devices.id }).from(schema.devices).orderBy(desc(schema.devices.id)).limit(1);
    const maxN = rows.length ? Number(/^D(\d+)$/.exec(rows[0].id)?.[1] ?? 0) : 0;
    const deviceId = `D${String(maxN + 1).padStart(3, "0")}`;

    await db.insert(schema.devices).values({
      id: deviceId,
      familyId,
      name,
      kind,
      room: String(body.room ?? "家中").trim(),
      state: "normal",
      reading: "normal",
      unit: null,
      riskLevel: "low",
      lastSync: new Date().toISOString(),
      source: "simulator",
      permission: "read",
      relatedEventIds: "[]",
      haEntity: null,
    });
    return Response.json({ id: deviceId, name }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "添加失败" }, { status: 500 });
  }
}
