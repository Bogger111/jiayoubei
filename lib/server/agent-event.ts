import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AgentAnalysis } from "@/lib/contracts";
import type { TimelineEntry } from "@/lib/product-models";
import { ProductInputError } from "@/lib/product-input";

export function normalizeRisk(
  level: string,
): "attention" | "warning" | "critical" {
  if (level === "critical" || level === "high") return "critical";
  return level === "medium" ? "warning" : "attention";
}
const randomId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** Save the analysis, human tasks, notification and audit as one transaction. */
export async function createAgentEvent(
  familyId: string,
  query: string,
  analysis: AgentAnalysis,
) {
  const db = getDb();
  const timestamp = new Date().toISOString();
  const eventId = randomId("E");
  const riskLevel = normalizeRisk(analysis.riskLevel);
  const actor = analysis.mode === "live_model" ? "家有备 AI" : "安全规则";
  const target = analysis.targetMember || "家人（待确认）";
  const members = await db
    .select()
    .from(schema.familyMembers)
    .where(eq(schema.familyMembers.familyId, familyId));
  const assignee =
    members.find(
      (member) => member.role === "家庭管理员" || member.role === "admin",
    ) ?? members[0];
  if (!assignee)
    throw new ProductInputError("请先添加可处理事件的家庭成员", 409);
  const steps = analysis.plan
    .filter((step) => step.title && step.tool === "create_task")
    .slice(0, 2);
  const tasks = steps.map((step) => ({
    id: randomId("T"),
    familyId,
    title: step.title.slice(0, 200),
    description: step.detail.slice(0, 4000),
    assignee: assignee.id,
    creator: actor,
    sourceEventId: eventId,
    priority: riskLevel === "critical" ? "urgent" : "high",
    status: "to_receive",
    dueAt: new Date(
      Date.now() +
        Math.max(1, Math.min(120, step.timeoutMinutes || 10)) * 60000,
    ).toISOString(),
  }));
  const taskIds = tasks.map((task) => task.id);
  const title = `${riskLevel === "critical" ? "紧急线索" : "家庭情况待核实"}：${target}`;
  const description = [
    `家庭描述：${query}`,
    `分析：${analysis.summary}`,
    analysis.evidence.length ? `依据：${analysis.evidence.join("；")}` : "",
    analysis.missingInformation.length
      ? `待补充：${analysis.missingInformation.join("；")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const timeline: TimelineEntry[] = [
    {
      id: randomId("L"),
      title: "家庭描述已记录",
      detail: query,
      time: timestamp,
      actor: "家庭成员",
      tone: riskLevel === "critical" ? "critical" : "info",
    },
    {
      id: randomId("L"),
      title:
        analysis.mode === "live_model" ? "模型分析已保存" : "规则分析已保存",
      detail: analysis.summary,
      time: timestamp,
      actor,
      tone: "info",
    },
    {
      id: randomId("L"),
      title: taskIds.length
        ? `已创建 ${taskIds.length} 条人工核实任务`
        : "等待家庭成员核实",
      detail: `责任人：${assignee.name}；处理记录保存后，由家庭成员确认完成。`,
      time: timestamp,
      actor,
      tone: "warning",
    },
  ];
  const eventWrite = db
    .insert(schema.events)
    .values({
      id: eventId,
      familyId,
      title,
      description,
      riskLevel,
      status: "pending_confirmation",
      source: analysis.mode === "live_model" ? "ai_agent" : "rules_agent",
      createdAt: timestamp,
      updatedAt: timestamp,
      relatedMembers: JSON.stringify([assignee.id]),
      relatedDevices: "[]",
      relatedTasks: JSON.stringify(taskIds),
      aiAssessment: analysis.summary,
      timeline: JSON.stringify(timeline),
    });
  const noticeWrite = db
    .insert(schema.notifications)
    .values({
      id: randomId("N"),
      familyId,
      category: riskLevel === "critical" ? "urgent" : "action",
      title,
      detail: analysis.summary.slice(0, 200),
      time: timestamp,
      read: false,
      eventId,
    });
  const auditWrite = db
    .insert(schema.auditLogs)
    .values({
      id: randomId("AL"),
      familyId,
      actor,
      actorType: analysis.mode === "live_model" ? "ai" : "rule",
      time: timestamp,
      target: eventId,
      action: "保存分析与家庭任务",
      reason: `${analysis.mode} · ${taskIds.length} 条人工任务`,
      riskLevel,
      result: "success",
    });
  if (tasks.length)
    await db.batch([
      eventWrite,
      ...tasks.map((task) => db.insert(schema.tasks).values(task)),
      noticeWrite,
      auditWrite,
    ]);
  else await db.batch([eventWrite, noticeWrite, auditWrite]);
  // Push is a separate delivery attempt; persisted records remain the source of truth.
  try {
    const { sendPushToFamily } = await import("./push");
    await sendPushToFamily(
      familyId,
      title,
      analysis.summary.slice(0, 80),
      `/events/${eventId}`,
    );
  } catch {
    /* A failed push does not roll back records. */
  }
  return { eventId, title, riskLevel, taskIds };
}
