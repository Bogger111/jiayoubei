import { privateJson } from "@/lib/server/json-response";
import { analyzeFamilyEvent } from "@/lib/agent-engine";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { inputText, readObjectBody } from "@/lib/server/request-body";
import { readProductState } from "@/lib/server/product-repo";
import { createAgentEvent } from "@/lib/server/agent-event";
import {isHomeControlRequest,actionDescription} from '@/lib/home-control';
import {prepareHomeControl} from '@/lib/server/home-control-service';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const payload = await readObjectBody(request);
    const query = inputText(payload.query, "家庭情况描述", 4000);
    if(isHomeControlRequest(query)){
      const plan=await prepareHomeControl(session.user,{text:query.slice(0,1000),source:'agent'});
      return privateJson({text:'已经整理好本次家庭调控计划：\n'+plan.steps.map((step,i)=>`${i+1}. ${actionDescription(step,step.deviceName)}`).join('\n')+'\n\n查看完整计划，确认后统一执行。',cardType:'device',relatedId:plan.id,analysis:{mode:'rules_fallback'},riskLevel:'normal',safetyNotice:''});
    }
    const familyState = await readProductState(
      session.user.familyId,
      session.user,
    );
    const result = await analyzeFamilyEvent({
      familyId: session.user.familyId,
      query,
      familyProfile: {
        family: familyState.family,
        members: familyState.members.map(({ name, relation, role }) => ({
          name,
          relation,
          role,
        })),
      },
    });
    const a = result.analysis;
    // 中风险及以上场景：AI 主动立事件 + 创建任务，进入家庭协同流程
    let eventId: string | undefined;
    let taskIds: string[] = [];
    let persistenceWarning: string | undefined;
    if (
      a.riskLevel === "medium" ||
      a.riskLevel === "high" ||
      a.riskLevel === "critical"
    ) {
      try {
        const created = await createAgentEvent(session.user.familyId, query, a);
        eventId = created.eventId;
        taskIds = created.taskIds ?? [];
      } catch {
        persistenceWarning = "分析已完成，但事件与任务暂未保存，请人工重试。";
      }
    }
    // 平铺格式：应用端聊天页需要 {text, cardType, safetyNotice}
    const planText = (a.plan ?? [])
      .map(
        (p: { title?: string; requiresConfirmation?: boolean }) =>
          `${p.title ?? ""}${p.requiresConfirmation ? "（需人工确认）" : ""}`,
      )
      .filter(Boolean)
      .join("\n");
    const highRisk = a.riskLevel === "high" || a.riskLevel === "critical";
    const text = [
      `【${a.riskLabel ?? "家庭安全分析"}】${a.summary ?? ""}`,
      a.evidence?.length ? `依据：${a.evidence.join("；")}` : "",
      a.plan?.length ? `协同计划：\n${planText}` : "",
      a.missingInformation?.length
        ? `待补充信息：${a.missingInformation.join("；")}`
        : "",
      persistenceWarning ?? "",
      eventId
        ? `已创建事件 ${eventId}${taskIds.length ? `，并拆解为 ${taskIds.length} 条家庭任务（${taskIds.join("、")}）` : ""}，请前往确认。`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return privateJson({
      ...result,
      text,
      eventId,
      taskIds,
      persistenceWarning,
      relatedId: taskIds[0] ?? eventId,
      cardType: taskIds.length
        ? ("task" as const)
        : highRisk
          ? ("risk" as const)
          : undefined,
      safetyNotice: a.safetyNotice ?? "高风险操作必须人工确认",
    });
  } catch (error) {
    return apiError(error);
  }
}
