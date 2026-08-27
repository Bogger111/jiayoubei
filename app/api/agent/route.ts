import { analyzeFamilyEvent } from "@/lib/agent-engine";
import { requireSession } from "@/lib/server/session";
import { createAgentEvent } from "@/lib/server/agent-event";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
    const payload = await request.json() as { query?: string; familyProfile?: Record<string, unknown> };
    const query = payload.query?.trim();
    if (!query) return Response.json({ error: "query is required" }, { status: 400 });
    const result = await analyzeFamilyEvent({ query, familyProfile: payload.familyProfile });
    const a = result.analysis;
    // 中风险及以上场景：AI 主动立事件 + 创建任务，进入家庭协同流程
    let eventId: string | undefined;
    let taskIds: string[] = [];
    if (a.riskLevel === "medium" || a.riskLevel === "high" || a.riskLevel === "critical") {
      try {
        const created = await createAgentEvent(session.user.familyId, query, a);
        eventId = created.eventId;
        taskIds = created.taskIds ?? [];
      } catch {
        // 立事件失败不阻塞回答
      }
    }
    // 平铺格式：应用端聊天页需要 {text, cardType, safetyNotice}
    const planText = (a.plan ?? [])
      .map((p: { title?: string; requiresConfirmation?: boolean }) => `${p.title ?? ""}${p.requiresConfirmation ? "（需人工确认）" : ""}`)
      .filter(Boolean)
      .join("\n");
    const highRisk = a.riskLevel === "high" || a.riskLevel === "critical";
    const text = [
      `【${a.riskLabel ?? "家庭安全分析"}】${a.summary ?? ""}`,
      a.evidence?.length ? `依据：${a.evidence.join("；")}` : "",
      a.plan?.length ? `协同计划：\n${planText}` : "",
      a.missingInformation?.length ? `待补充信息：${a.missingInformation.join("；")}` : "",
      eventId ? `已自动创建事件 ${eventId}${taskIds.length ? `，并拆解为 ${taskIds.length} 条家庭任务（${taskIds.join("、")}）` : ""}，请前往确认。` : "",
    ].filter(Boolean).join("\n\n");
    return Response.json({
      ...result,
      text,
      eventId,
      taskIds,
      relatedId: taskIds[0] ?? eventId,
      cardType: taskIds.length ? ("task" as const) : highRisk ? ("risk" as const) : a.plan?.length ? ("task" as const) : undefined,
      safetyNotice: a.safetyNotice ?? "高风险操作必须人工确认",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent analysis failed" }, { status: 500 });
  }
}
