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
import { memberInput } from "@/lib/resource-input";
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("维护成员资料需要管理员权限", 403);
    const values = memberInput(await readObjectBody(request));
    const id = `M_${crypto.randomUUID()}`;
    const db = getDb();
    await db.batch([
      db.insert(schema.familyMembers).values({
        id,
        familyId: session.user.familyId,
        ...values,
        avatar: values.name.slice(0, 1),
        location: "未共享",
        permissions: "[]",
      }),
      db.insert(schema.auditLogs).values({
        id: `AL_${crypto.randomUUID()}`,
        familyId: session.user.familyId,
        actor: session.user.name,
        actorType: "user",
        time: new Date().toISOString(),
        target: id,
        action: "添加家庭成员",
        reason: values.name,
        riskLevel: "normal",
        result: "success",
      }),
    ]);
    return privateJson({ id, name: values.name }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
