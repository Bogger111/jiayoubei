import type { AgentAnalysis, AgentPlanStep, DeviceState, FamilyMemory } from "./contracts";
import { retrieveMemories } from "./memory-store";
import { getSmartHomeSnapshot } from "./smart-home";
import { readRuntimeEnv } from "./runtime-env";

const safetyNotice = "AI 只负责状态理解与计划建议；专业救援、第三方入户、敏感信息共享等高风险动作必须由人确认。";

function defaultPlan(): AgentPlanStep[] {
  return [
    { id: "message-check", title: "发送低打扰安全确认", detail: "发送带“我没事”按钮的关怀消息，并等待确认。", tool: "create_task", timeoutMinutes: 10, requiresConfirmation: true, risk: "low" },
    { id: "device-check", title: "复核智慧家居信号", detail: "读取门磁、存在传感器、烟雾与燃气状态，排除明显危险信号。", tool: "read_device_state", timeoutMinutes: 0, requiresConfirmation: false, risk: "low" },
    { id: "phone-check", title: "未响应时提醒人工电话联系", detail: "系统创建电话任务并记录人工联系结果，不自动拨号。", tool: "create_task", timeoutMinutes: 5, requiresConfirmation: true, risk: "medium" },
    { id: "neighbor-check", title: "继续无响应时请求邻里确认", detail: "由家庭管理员确认后联系同楼层邻居，必要时再联系专业服务。", tool: "create_task", timeoutMinutes: 5, requiresConfirmation: true, risk: "high" },
  ];
}

function deviceEvidence(devices: DeviceState[]) {
  return devices
    .filter((device) => device.risk !== "normal" || ["door", "presence", "smoke", "gas"].includes(device.type))
    .slice(0, 5)
    .map((device) => ({ id: device.id, name: device.name, state: device.state, value: device.value, risk: device.risk, updatedAt: device.updatedAt }));
}

function rulesAnalysis(query: string, memories: FamilyMemory[], devices: DeviceState[]): AgentAnalysis {
  const urgentText = /意识不清|呼吸困难|明火|燃气味|摔倒|大量出血|求救|烟雾/.test(query);
  const deviceAlarm = devices.some((device) => device.risk === "alarm");
  const riskLevel = urgentText || deviceAlarm ? "critical" : "medium";
  const riskLabel = riskLevel === "critical" ? "立即人工处置" : "中度关注";
  const smartEvidence = deviceEvidence(devices);
  const evidence = [
    "成员独居且超过日常回复间隔",
    "电话暂未接通，需要分级确认",
    ...smartEvidence.slice(0, 2).map((device) => `${device.name}：${device.value}`),
  ];
  return {
    mode: "rules_fallback",
    targetMember: "林秀兰",
    riskLevel,
    riskLabel,
    confidence: riskLevel === "critical" ? 0.96 : 0.84,
    summary: riskLevel === "critical"
      ? "文本或设备信号包含明确危险线索，已触发确定性高风险规则。"
      : "当前没有明确医疗或消防警报，但独居成员长时间未回复，需要马上开始低打扰确认并持续跟进。",
    evidence,
    missingInformation: ["今天是否有临时外出安排", "电话未接是否持续超过 10 分钟"],
    memoryRefs: memories.map(({ id, type, content, source }) => ({ id, type, content, source })),
    deviceSignals: smartEvidence,
    plan: defaultPlan(),
    recommendedTools: ["read_device_state", "create_task", "set_timeout", "write_audit_log"],
    safetyNotice,
    generatedAt: new Date().toISOString(),
  };
}

function parseModelJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 8) : fallback;
}

function normalizePlan(value: unknown): AgentPlanStep[] {
  if (!Array.isArray(value)) return defaultPlan();
  const plan = value.slice(0, 6).map((item, index) => {
    const raw = typeof item === "object" && item ? item as Record<string, unknown> : {};
    const risk = ["low", "medium", "high"].includes(String(raw.risk)) ? String(raw.risk) as AgentPlanStep["risk"] : "medium";
    return {
      id: typeof raw.id === "string" ? raw.id : `step-${index + 1}`,
      title: typeof raw.title === "string" ? raw.title : `处理步骤 ${index + 1}`,
      detail: typeof raw.detail === "string" ? raw.detail : "由家庭管理员确认执行细节",
      tool: typeof raw.tool === "string" ? raw.tool : "create_task",
      timeoutMinutes: Number.isFinite(Number(raw.timeoutMinutes)) ? Math.max(0, Math.min(120, Number(raw.timeoutMinutes))) : 5,
      requiresConfirmation: raw.requiresConfirmation !== false,
      risk,
    };
  });
  return plan.length ? plan : defaultPlan();
}

async function callLiveModel(query: string, memories: FamilyMemory[], devices: DeviceState[], familyProfile: Record<string, unknown>): Promise<AgentAnalysis | null> {
  const apiKey = readRuntimeEnv("AI_API_KEY");
  const model = readRuntimeEnv("AI_MODEL");
  if (!apiKey || !model) return null;
  const baseUrl = (readRuntimeEnv("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const promptContext = {
    familyProfile,
    retrievedMemories: memories.map(({ id, member, type, content, source }) => ({ id, member, type, content, source })),
    smartHomeSignals: devices.map(({ id, name, room, type, state, value, risk, updatedAt, source }) => ({ id, name, room, type, state, value, risk, updatedAt, source })),
  };
  const system = `你是“家有备”家庭应急协调 Agent。你的职责是理解状态、识别缺失信息、生成分级协同计划，不做医疗诊断。\n
必须只输出 JSON，不输出思维链。判断依据只能引用输入、家庭记忆或设备状态。\n
JSON 字段：targetMember, riskLevel(low|medium|high|critical), riskLabel, confidence(0-1), summary, evidence(string[]), missingInformation(string[]), plan([{id,title,detail,tool,timeoutMinutes,requiresConfirmation,risk(low|medium|high)}]), recommendedTools(string[])。\n
可用工具仅限：create_task,set_timeout,update_event_status,write_audit_log,read_device_state,control_device。外部电话、邻居联系、摄像头、门锁和专业救援必须人工确认；绝不建议自动开锁。`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `事件描述：${query}\n\n可用上下文：${JSON.stringify(promptContext)}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`model endpoint returned ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("model returned empty content");
  const raw = parseModelJson(content);
  const allowedRisk = ["low", "medium", "high", "critical"];
  const modelRisk = allowedRisk.includes(String(raw.riskLevel)) ? String(raw.riskLevel) as AgentAnalysis["riskLevel"] : "medium";
  const deviceAlarm = devices.some((device) => device.risk === "alarm");
  const riskLevel = deviceAlarm ? "critical" : modelRisk;
  return {
    mode: "live_model",
    model,
    targetMember: typeof raw.targetMember === "string" ? raw.targetMember : "林秀兰",
    riskLevel,
    riskLabel: deviceAlarm ? "设备告警 · 立即人工处置" : typeof raw.riskLabel === "string" ? raw.riskLabel : "需要关注",
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.7)),
    summary: typeof raw.summary === "string" ? raw.summary : "模型已完成家庭状态分析。",
    evidence: stringArray(raw.evidence, ["已读取家庭档案和设备状态"]),
    missingInformation: stringArray(raw.missingInformation, []),
    memoryRefs: memories.map(({ id, type, content, source }) => ({ id, type, content, source })),
    deviceSignals: deviceEvidence(devices),
    plan: normalizePlan(raw.plan),
    recommendedTools: stringArray(raw.recommendedTools, ["create_task", "set_timeout", "read_device_state"]),
    safetyNotice,
    generatedAt: new Date().toISOString(),
  };
}

export async function analyzeFamilyEvent(input: { query: string; familyProfile?: Record<string, unknown> }) {
  const memories = await retrieveMemories(input.query);
  const smartHome = await getSmartHomeSnapshot();
  const fallback = rulesAnalysis(input.query, memories, smartHome.devices);
  try {
    const live = await callLiveModel(input.query, memories, smartHome.devices, input.familyProfile ?? {});
    return { analysis: live ?? fallback, smartHomeDriver: smartHome.driver, warning: smartHome.warning };
  } catch (error) {
    return { analysis: fallback, smartHomeDriver: smartHome.driver, warning: error instanceof Error ? error.message : "模型调用失败，已使用规则模式" };
  }
}
