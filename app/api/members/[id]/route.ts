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
import { and, eq } from "drizzle-orm";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("维护成员资料需要管理员权限", 403);
    const { id } = await params;
    const db = getDb();
    const predicate = and(
      eq(schema.familyMembers.id, id),
      eq(schema.familyMembers.familyId, session.user.familyId),
    );
    const [current] = await db
      .select()
      .from(schema.familyMembers)
      .where(predicate)
      .limit(1);
    if (!current) throw new ProductInputError("成员不存在", 404);
    const values = memberInput({
      ...current,
      ...(await readObjectBody(request)),
    });
    await db.batch([
      db
        .update(schema.familyMembers)
        .set({ ...values, avatar: values.name.slice(0, 1) })
        .where(predicate),
      ...(current.userId
        ? [
            db
              .update(schema.users)
              .set({
                name: values.name,
                phone: values.phone,
                avatar: values.name.slice(0, 1),
              })
              .where(
                and(
                  eq(schema.users.id, current.userId),
                  eq(schema.users.familyId, session.user.familyId),
                ),
              ),
          ]
        : []),
      db.insert(schema.auditLogs).values({
        id: `AL_${crypto.randomUUID()}`,
        familyId: session.user.familyId,
        actor: session.user.name,
        actorType: "user",
        time: new Date().toISOString(),
        target: id,
        action: "编辑成员资料",
        reason: values.name,
        riskLevel: "normal",
        result: "success",
      }),
    ]);
    return privateJson({
      ok: true,
      member: { ...current, ...values, avatar: values.name.slice(0, 1) },
    });
  } catch (error) {
    return apiError(error);
  }
}
