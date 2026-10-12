import { privateJson } from "@/lib/server/json-response";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";
import { inputText, readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";

const kinds = [
  "security",
  "environment",
  "lighting",
  "lock",
  "camera",
  "health",
  "other",
];

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("添加设备需要家庭管理员权限", 403);
    const body = await readObjectBody(request);
    const name = inputText(body.name, "设备名称");
    const room = inputText(body.room, "房间", 100, true) || "家中";
    const kind =
      typeof body.kind === "string" && kinds.includes(body.kind)
        ? body.kind
        : "other";
    const id = `D_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const db = getDb();
    await db.batch([
      db.insert(schema.devices).values({
        id,
        familyId: session.user.familyId,
        name,
        kind,
        room,
        state: "normal",
        reading: "正常（模拟状态）",
        riskLevel: "normal",
        lastSync: timestamp,
        source: "simulator",
        permission: "仅读取模拟状态",
        relatedEventIds: "[]",
      }),
      db.insert(schema.auditLogs).values({
        id: `ALD_${crypto.randomUUID()}`,
        familyId: session.user.familyId,
        actor: session.user.name,
        actorType: "user",
        time: timestamp,
        target: id,
        action: "添加模拟设备",
        reason: `${name} · ${room}`,
        riskLevel: "normal",
        result: "success",
      }),
    ]);
    return privateJson({ id, name }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
