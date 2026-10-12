import { privateJson } from "@/lib/server/json-response";
import { currentFamily } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { isFamilyAdmin } from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import { familyInput } from "@/lib/resource-input";
import { ProductInputError } from "@/lib/product-input";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const result = await currentFamily(session.user.familyId);
    if (!result) return privateJson({ error: "家庭不存在" }, { status: 404 });
    return privateJson(result);
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("修改家庭资料需要管理员权限", 403);
    const current = await currentFamily(session.user.familyId);
    if (!current) throw new ProductInputError("家庭不存在", 404);
    const values = familyInput(await readObjectBody(request));
    const db = getDb();
    await db.batch([
      db
        .update(schema.families)
        .set(values)
        .where(eq(schema.families.id, session.user.familyId)),
      db.insert(schema.auditLogs).values({
        id: `AL_${crypto.randomUUID()}`,
        familyId: session.user.familyId,
        actor: session.user.name,
        actorType: "user",
        time: new Date().toISOString(),
        target: session.user.familyId,
        action: "修改家庭资料",
        reason: "管理员修改家庭名称或地址",
        riskLevel: "normal",
        result: "success",
      }),
    ]);
    return privateJson({ ...current.family, ...values });
  } catch (error) {
    return apiError(error);
  }
}
