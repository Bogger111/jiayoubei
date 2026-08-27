import type { AIMessage } from "@/lib/product-models";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";

export type AgentAnalysis = {
  text: string;
  cardType?: AIMessage["cardType"];
  relatedId?: string;
  safetyNotice: string;
  eventId?: string;
  taskIds?: string[];
};

export const agentApi = {
  async analyze(query: string): Promise<AgentAnalysis> {
    if (!apiConfig.useMock) return apiRequest("/api/agent", { method: "POST", body: JSON.stringify({ query }) });
    await mockDelay(420);
    const highRisk = /开门|陌生人|门锁/.test(query);
    const fireRisk = /烟雾|燃气|明火/.test(query);
    return {
      text: highRisk
        ? "我已识别到门锁相关高风险场景。可以帮你核对访客信息，但我不会直接开门；下一步必须进入人工授权确认。"
        : fireRisk
          ? "这包含可能的消防风险线索。我会优先读取硬告警，并把专业救援和设备操作放在人工确认边界内。"
          : "我已理解这是一项需要持续跟进的家庭安全事项。建议先创建任务、确认责任人，再根据回复结果逐级升级。",
      cardType: highRisk ? "authorization" : "task",
      relatedId: highRisk ? "A004" : "T001",
      safetyNotice: "高风险操作必须人工确认",
    };
  },
};
