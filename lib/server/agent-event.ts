import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TimelineEntry } from "@/lib/product-models";

/**
 * AI Agent 主动立事件 + 创建任务：当 AI 识别到中高风险场景时，
 * 自动创建事件 + 时间线 + 任务 + 通知 + 审计 + 推送，进入家庭协同流程。
 */

// 引擎词汇 → 前端词汇（normal/attention/warning/critical）
export function normalizeRisk(level: string): "attention" | "warning" | "critical" {
  if (level === "critical" || level === "high") return "critical";
  if (level === "medium") return "warning";
  return "attention";
}

const randomId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export async function createAgentEvent(familyId: string, query: string, analysis: {
  riskLevel?: string;
  riskLabel?: string;
  targetMember?: string;
  summary?: string;
  evidence?: string[];
  missingInformation?: string[];
  plan?: { title?: string; detail?: string; tool?: string; requiresConfirmation?: boolean; timeoutMinutes?: number; risk?: string }[];
  memoryRefs?: { content?: string }[];
  deviceSignals?: { device?: string; state?: string }[];
  safetyNotice?: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const eventId = randomId("E");
  const riskLevel = normalizeRisk(analysis.riskLevel ?? "medium");
  const targetMember = analysis.targetMember ?? "家人";
  const planSteps = (analysis.plan ?? []).filter((p) => p.title);

  const title = riskLevel === "critical"
    ? `AI 紧急识别：${targetMember}可能处于危险状态`
    : `AI 识别：${targetMember}存在安全风险`;

  const description = [
    `AI 分析（基于家庭档案与真实设备信号）：${analysis.summary ?? ""}`,
    analysis.evidence?.length ? `依据：${analysis.evidence.join("；")}` : "",
    planSteps.length ? `协同计划：${planSteps.map((p) => `${p.title}${p.requiresConfirmation ? "（需人工确认）" : ""}`).join("；")}` : "",
    analysis.missingInformation?.length ? `待补充：${analysis.missingInformation.join("；")}` : "",
  ].filter(Boolean).join("\n");

  const timeline: TimelineEntry[] = [
    { id: "T1", title: "AI 识别紧急信号", detail: query, time: "刚刚", actor: "家有备 AI", tone: riskLevel === "critical" ? "critical" : "warning" },
    { id: "T2", title: "AI 完成分析并制定协同计划", detail: `${riskLevel === "critical" ? "紧急" : "警告"} · 已拆解为家庭任务，需成员确认后执行`, time: "刚刚", actor: "家有备 AI", tone: "info" },
    { id: "T3", title: "已通知家庭成员", detail: "等待人工确认与处置", time: "刚刚", actor: "家有备 AI", tone: "info" },
  ];

  await db.insert(schema.events).values({
    id: eventId, familyId, title, description, riskLevel, status: "pending_confirmation", source: "ai_agent",
    createdAt: now, updatedAt: now, relatedMembers: "[]", relatedDevices: "[]",
    relatedTasks: "[]", relatedAuthorizationId: null,
    aiAssessment: `[AI Agent 主动立事件] ${analysis.riskLabel ?? riskLevel}：${analysis.summary ?? ""}${planSteps.length ? ` 计划：${planSteps.map((p) => `${p.title}${p.requiresConfirmation ? "（需人工确认）" : ""}`).join("；")}` : ""}`,
    timeline: JSON.stringify(timeline),
  });

  // —— AI 创建真实家庭任务（从计划步骤拆解，最多 2 条）——
  const taskIds: string[] = [];
  if (planSteps.length) {
    // 找目标成员对应的成员 ID（按名字匹配，找不到默认家庭管理员 M003）
    const members = await db.select({ id: schema.familyMembers.id, name: schema.familyMembers.name, role: schema.familyMembers.role }).from(schema.familyMembers).where(eq(schema.familyMembers.familyId, familyId));
    // 任务分配给家庭管理员（执行协同的人），而不是被关心的目标成员
    const adminId = members.find((m) => m.role === "家庭管理员")?.id ?? members.find((m) => m.id === "M003")?.id ?? members[0]?.id ?? "M003";
    const targetId = adminId;
    const priority = riskLevel === "critical" ? "urgent" : riskLevel === "warning" ? "high" : "medium";

    for (const step of planSteps.slice(0, 2)) {
      const taskId = randomId("T");
      const dueAt = new Date(Date.now() + (step.timeoutMinutes ?? 30) * 60000).toISOString();
      await db.insert(schema.tasks).values({
        id: taskId, familyId, title: step.title ?? "AI 建议行动", description: step.detail ?? `${step.title}（来自 AI 协同计划）`,
        assignee: targetId, creator: "AI Agent", sourceEventId: eventId,
        priority, status: "to_receive", dueAt,
        evidence: null, evidenceUploadedAt: null, familyConfirmedAt: null, helpRequested: false,
      });
      taskIds.push(taskId);
    }
    // 事件关联任务
    await db.update(schema.events).set({ relatedTasks: JSON.stringify(taskIds) }).where(eq(schema.events.id, eventId));
    timeline.push({ id: "T4", title: `AI 已创建 ${taskIds.length} 条家庭任务`, detail: `责任人将收到任务通知，完成需上传证据并由家庭确认`, time: "刚刚", actor: "家有备 AI", tone: "info" });
    await db.update(schema.events).set({ timeline: JSON.stringify(timeline), updatedAt: now }).where(eq(schema.events.id, eventId));
  }

  await db.insert(schema.notifications).values({
    id: randomId("N"), familyId, category: "action",
    title, detail: description.slice(0, 80), time: "刚刚", read: false, eventId,
  });

  await db.insert(schema.auditLogs).values({
    id: randomId("AL"), familyId, actor: "家有备 AI", actorType: "ai",
    time: now, target: eventId, action: "AI 主动立事件并创建任务",
    reason: `高风险场景识别：${query.slice(0, 50)}；创建 ${taskIds.length} 条任务`, riskLevel, result: "success",
  });

  // 推送通知
  try {
    const { sendPushToFamily } = await import("./push");
    await sendPushToFamily(familyId, `新事件：${title}`, description.slice(0, 80), `/events/${eventId}`);
  } catch {
    // 推送失败不影响落库
  }

  return { eventId, title, riskLevel, taskIds };
}
