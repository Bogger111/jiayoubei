import type { AIMessage, RiskLevel } from "@/lib/product-models";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";
import { nonIncidentReply } from "@/lib/agent-guards";

export type AgentAnalysis = {
  text: string;
  cardType?: AIMessage["cardType"];
  relatedId?: string;
  safetyNotice: string;
  eventId?: string;
  taskIds?: string[];
  analysisMode?: AIMessage["analysisMode"];
  analysis?: { mode?: "live_model" | "rules_fallback" };
  riskLevel?: RiskLevel;
};

export const agentApi = {
  async analyze(query: string): Promise<AgentAnalysis> {
    if (!apiConfig.useMock) {
      const result = await apiRequest<AgentAnalysis>("/api/agent", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      return { ...result, analysisMode: result.analysis?.mode };
    }
    await mockDelay(420);
    const informationReply = nonIncidentReply(query);
    if (informationReply)
      return {
        text: informationReply,
        analysisMode: "demo",
        riskLevel: "normal",
        safetyNotice: "只有报告现场情况后，才整理核实事项。",
      };
    const highRisk = /开门|陌生人|门锁/.test(query);
    const fireRisk = /烟雾|燃气|明火/.test(query);
    const followup =
      highRisk ||
      fireRisk ||
      /老人|家人|妈妈|爸爸|失联|没有活动|没回|宠物|喂食|帮我|核实|任务|摔倒|异常/.test(
        query,
      );
    return {
      analysisMode: "demo",
      riskLevel:
        highRisk || fireRisk || /摔倒|求救/.test(query)
          ? "critical"
          : "attention",
      text: highRisk
        ? "我已识别到门锁相关高风险场景。可以帮你核对访客信息，但我不会直接开门；下一步必须进入人工授权确认。"
        : fireRisk
          ? "这段描述包含可能的消防风险线索。我会创建演示核实任务，现场情况和后续救援由家人确认。"
          : followup
            ? "我会把这段情况整理成待核实的演示事件与任务，请由家人记录实际确认结果。"
            : "可以描述具体发生的情况和涉及成员，我会帮你整理需要核实的信息。",
      cardType: highRisk ? "authorization" : followup ? "task" : undefined,
      safetyNotice: "高风险操作必须人工确认",
    };
  },
};
