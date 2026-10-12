import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { ProductInputError } from "@/lib/product-input";
import { taskCreateInput } from "@/lib/task-create-input";
import { ensureProductSchema, findEvent } from "./product-repo";
import { isFamilyAdmin, type SessionUser } from "./session";

export async function createFamilyTask(
  user: SessionUser,
  input: Record<string, unknown>,
) {
  if (!isFamilyAdmin(user))
    throw new ProductInputError("创建家庭任务需要管理员权限", 403);
  await ensureProductSchema();
  const values = taskCreateInput(input);
  const db = getDb();
  const [member] = await db
    .select()
    .from(schema.familyMembers)
    .where(
      and(
        eq(schema.familyMembers.id, values.assignee),
        eq(schema.familyMembers.familyId, user.familyId),
      ),
    )
    .limit(1);
  if (!member) throw new ProductInputError("负责人不属于当前家庭");
  const event = values.sourceEventId
    ? await findEvent(user.familyId, values.sourceEventId)
    : undefined;
  if (values.sourceEventId && !event)
    throw new ProductInputError("来源事件不存在", 404);
  if (event && ["resolved", "closed"].includes(event.status))
    throw new ProductInputError("来源事件已结束，请选择正在处理的事件", 409);
  const id = `T_${crypto.randomUUID()}`;
  const time = new Date().toISOString();
  const taskWrite = db
    .insert(schema.tasks)
    .values({
      id,
      familyId: user.familyId,
      ...values,
      sourceEventId: values.sourceEventId || null,
      creator: user.name,
      status: "to_receive",
    });
  const auditWrite = db
    .insert(schema.auditLogs)
    .values({
      id: `AL_${crypto.randomUUID()}`,
      familyId: user.familyId,
      actor: user.name,
      actorType: "user",
      time,
      target: id,
      action: "创建家庭任务",
      reason: values.title,
      riskLevel: "normal",
      result: "success",
    });
  if (event) {
    const entry = JSON.stringify({
      id: `L_${crypto.randomUUID()}`,
      time,
      title: "已安排家庭任务",
      detail: `${values.title} · ${member.name}`,
      actor: user.name,
      tone: "info",
    });
    const eventWrite = db
      .update(schema.events)
      .set({
        relatedTasks: sql`json_insert(COALESCE(${schema.events.relatedTasks}, '[]'), '$[#]', ${id})`,
        timeline: sql`json_insert(COALESCE(${schema.events.timeline}, '[]'), '$[#]', json(${entry}))`,
        updatedAt: time,
      })
      .where(
        and(
          eq(schema.events.id, event.id),
          eq(schema.events.familyId, user.familyId),
        ),
      );
    await db.batch([taskWrite, auditWrite, eventWrite]);
  } else await db.batch([taskWrite, auditWrite]);
  return { id, ...values, creator: user.name, status: "to_receive" as const };
}
