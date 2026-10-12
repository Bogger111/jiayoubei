import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { ProductInputError } from "@/lib/product-input";
import { isAuthorizationPolicyAllowed } from "@/lib/product-policy";
import type { Authorization } from "@/lib/product-models";
import { appendAudit, findAuthorization } from "./product-repo";
import type { SessionUser } from "./session";

export async function saveAuthorizationDecision(
  user: SessionUser,
  id: string,
  decision: "approve" | "reject",
) {
  const auth = await findAuthorization(user.familyId, id);
  if (!auth) throw new ProductInputError("授权请求不存在", 404);
  if (auth.status !== "pending")
    throw new ProductInputError("该授权请求已处理", 409);
  const timestamp = new Date().toISOString();
  const status = decision === "approve" ? "approved" : "rejected";
  const db = getDb();
  const authWrite = db
    .update(schema.authorizations)
    .set({ status })
    .where(
      and(
        eq(schema.authorizations.id, id),
        eq(schema.authorizations.familyId, user.familyId),
        eq(schema.authorizations.status, "pending"),
      ),
    );
  const auditWrite = db.insert(schema.auditLogs).values({
    id: `ALAD:${id}`,
    familyId: user.familyId,
    actor: user.name,
    actorType: "user",
    time: timestamp,
    target: `${id} ${auth.resource}`,
    action: decision === "approve" ? "允许本次操作" : "拒绝高风险操作",
    reason: `${auth.reason}；仅保存人工决定，未执行受保护设备动作`,
    riskLevel: auth.riskLevel,
    result: decision === "approve" ? "success" : "blocked",
  });
  const entry = JSON.stringify({
    id: `LAD:${id}`,
    time: timestamp,
    title: decision === "approve" ? "人工确认：仅此次允许" : "操作已拦截",
    detail:
      decision === "approve"
        ? "授权决定已保存；本系统未执行门锁或摄像头动作。"
        : "人工拒绝本次请求，未执行设备动作。",
    actor: user.name,
    tone: decision === "approve" ? "info" : "critical",
  });
  try {
    if (auth.eventId)
      await db.batch([
        authWrite,
        db
          .update(schema.events)
          .set({
            updatedAt: timestamp,
            status: sql`CASE WHEN ${schema.events.status}='closed' THEN 'closed' WHEN NOT EXISTS (SELECT 1 FROM tasks WHERE family_id=${user.familyId} AND source_event_id=${auth.eventId} AND status<>'completed') AND NOT EXISTS (SELECT 1 FROM authorizations WHERE family_id=${user.familyId} AND event_id=${auth.eventId} AND status='pending') THEN 'resolved' ELSE 'processing' END`,
            timeline: sql`json_insert(${schema.events.timeline}, '$[#]', json(${entry}))`,
          })
          .where(
            and(
              eq(schema.events.id, auth.eventId),
              eq(schema.events.familyId, user.familyId),
            ),
          ),
        db
          .update(schema.notifications)
          .set({ read: true })
          .where(
            and(
              eq(schema.notifications.familyId, user.familyId),
              eq(schema.notifications.eventId, auth.eventId),
            ),
          ),
        auditWrite,
      ]);
    else await db.batch([authWrite, auditWrite]);
  } catch (error) {
    if ((await findAuthorization(user.familyId, id))?.status !== "pending")
      throw new ProductInputError("该授权请求已处理", 409);
    throw error;
  }
  return { id, status };
}

export async function saveAuthorizationPolicy(
  user: SessionUser,
  id: string,
  policy: Authorization["policy"],
) {
  const auth = await findAuthorization(user.familyId, id);
  if (!auth) throw new ProductInputError("授权规则不存在", 404);
  if (auth.status !== "active")
    throw new ProductInputError("只有长期规则可以修改", 409);
  if (!isAuthorizationPolicyAllowed(auth, policy)) {
    await appendAudit(user.familyId, {
      actor: "安全规则",
      actorType: "rule",
      time: new Date().toISOString(),
      target: `${id} ${auth.resource}`,
      action: "拦截越权授权规则",
      reason: "Critical 与受保护资源不能设置为始终允许",
      riskLevel: auth.riskLevel,
      result: "blocked",
    });
    throw new ProductInputError("该高风险资源不能设置为始终允许", 403);
  }
  const db = getDb();
  await db.batch([
    db
      .update(schema.authorizations)
      .set({ policy })
      .where(
        and(
          eq(schema.authorizations.id, id),
          eq(schema.authorizations.familyId, user.familyId),
        ),
      ),
    db.insert(schema.auditLogs).values({
      id: `ALAP_${crypto.randomUUID()}`,
      familyId: user.familyId,
      actor: user.name,
      actorType: "user",
      time: new Date().toISOString(),
      target: id,
      action: "修改授权规则",
      reason: `长期规则：${policy}`,
      riskLevel: auth.riskLevel,
      result: "success",
    }),
  ]);
  return { id, policy };
}
