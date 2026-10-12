import { privateJson } from "@/lib/server/json-response";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";
import { inputText } from "@/lib/server/request-body";
import { and, eq } from "drizzle-orm";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("核实服务资源需要管理员权限", 403);
    const { id } = await params;
    const db = getDb();
    const predicate = and(
      eq(schema.serviceProviders.id, id),
      eq(schema.serviceProviders.familyId, session.user.familyId),
    );
    const [current] = await db
      .select()
      .from(schema.serviceProviders)
      .where(predicate)
      .limit(1);
    if (!current) throw new ProductInputError("资源不存在", 404);
    const payload = await readObjectBody(request);
    if (payload.verified !== true && payload.verified !== false)
      throw new ProductInputError("请明确填写核实状态");
    const note = inputText(payload.note, "核实方式与结果", 1000);
    if (payload.verified && note.length < 8)
      throw new ProductInputError("请填写至少 8 个字的核实记录");
    await db.batch([
      db
        .update(schema.serviceProviders)
        .set({
          verified: payload.verified,
          trustLevel: payload.verified ? "medium" : "unverified",
          note,
        })
        .where(predicate),
      db.insert(schema.auditLogs).values({
        id: `AL_${crypto.randomUUID()}`,
        familyId: session.user.familyId,
        actor: session.user.name,
        actorType: "user",
        time: new Date().toISOString(),
        target: id,
        action: payload.verified ? "核实服务联系方式" : "撤销服务核实状态",
        reason: note,
        riskLevel: "attention",
        result: "success",
      }),
    ]);
    return privateJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
