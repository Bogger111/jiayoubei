import type {
  AgentAnalysis,
  AgentPlanStep,
  DeviceState,
  FamilyMemory,
} from "./contracts";
import { retrieveMemories } from "./memory-store";
import { getFamilyDeviceSnapshot } from "./server/device-snapshot";
import { readRuntimeEnv } from "./runtime-env";
import {
  isConversationOnly,
  knownMemberName,
  nonIncidentReply,
} from "./agent-guards";

const safetyNotice =
  "AI 只负责状态理解与计划建议；专业救援、第三方入户、敏感信息共享等高风险动作必须由人确认。";

function defaultPlan(): AgentPlanStep[] {
  return [
    {
      id: "message-check",
      title: "人工核实家庭情况",
      detail: "由家庭成员联系本人，记录具体情况和确认结果。",
      tool: "create_task",
      timeoutMinutes: 10,
      requiresConfirmation: true,
      risk: "low",
    },
    {
      id: "device-check",
      title: "复核智慧家居信号",
      detail: "读取门磁、存在传感器、烟雾与燃气状态，排除明显危险信号。",
      tool: "read_device_state",
      timeoutMinutes: 0,
      requiresConfirmation: false,
      risk: "low",
    },
    {
      id: "phone-check",
      title: "未响应时提醒人工电话联系",
      detail: "系统创建电话任务并记录人工联系结果，不自动拨号。",
      tool: "create_task",
      timeoutMinutes: 5,
      requiresConfirmation: true,
      risk: "medium",
    },
    {
      id: "neighbor-check",
      title: "根据核实结果安排协作",
      detail: "由家庭成员选择联系人和处理方式，外部联系需要人工决定。",
      tool: "create_task",
      timeoutMinutes: 5,
      requiresConfirmation: true,
      risk: "high",
    },
  ];
}

function deviceEvidence(devices: DeviceState[]) {
  return devices
    .filter(
      (device) =>
        device.risk !== "normal" ||
        ["door", "presence", "smoke", "gas"].includes(device.type),
    )
    .slice(0, 5)
    .map((device) => ({
      id: device.id,
      name: device.name,
      state: device.state,
      value: device.value,
      risk: device.risk,
      updatedAt: device.updatedAt,
      source: device.source,
    }));
}

function rulesAnalysis(
  query: string,
  memories: FamilyMemory[],
  devices: DeviceState[],
): AgentAnalysis {
  const informationReply = nonIncidentReply(query);
  const urgentText =
    !informationReply &&
    /意识不清|呼吸困难|明火|燃气味|摔倒|大量出血|求救|烟雾/.test(query);
  const deviceAlarm = devices.some((device) => device.risk === "alarm");
  const conversationOnly =
    (isConversationOnly(query) || Boolean(informationReply)) && !deviceAlarm;
  const riskLevel =
    urgentText || deviceAlarm
      ? "critical"
      : conversationOnly
        ? "low"
        : "medium";
  const riskLabel =
    riskLevel === "critical"
      ? "立即人工处置"
      : riskLevel === "low"
        ? informationReply
          ? "功能与准备说明"
          : "等待情况描述"
        : "中度关注";
  const smartEvidence = deviceEvidence(devices);
  const evidence = [
    `家庭成员描述：${query.slice(0, 240)}`,
    ...smartEvidence
      .slice(0, 3)
      .map(
        (device) =>
          `${device.name}：${device.value}（${device.source === "simulator" ? "模拟信号" : "设备信号"}）`,
      ),
  ];
  const target =
    memories.find((memory) => query.includes(memory.member))?.member ??
    "家人（待确认）";
  return {
    mode: "rules_fallback",
    targetMember: target,
    riskLevel,
    riskLabel,
    confidence: 0,
    summary:
      riskLevel === "critical"
        ? "文本或设备信号包含明确危险线索，已触发确定性高风险规则。"
        : conversationOnly
          ? (informationReply ??
            "可以描述发生的具体情况和涉及成员，我会帮助整理需要核实的信息。")
          : "当前信息不足以确认危险程度。建议先核实描述、明确责任人，并记录人工确认结果。",
    evidence,
    missingInformation: conversationOnly
      ? []
      : ["具体涉及哪位家庭成员", "目前是否已经完成现场或电话确认"],
    memoryRefs: memories.map(({ id, type, content, source }) => ({
      id,
      type,
      content,
      source,
    })),
    deviceSignals: smartEvidence,
    plan: conversationOnly
      ? []
      : riskLevel === "critical"
        ? [
            {
              id: "urgent-confirm",
              title: "立即由家庭成员核实现场情况",
              detail: "记录具体危险线索与人员状态，紧急处置由家庭成员决定。",
              tool: "create_task",
              timeoutMinutes: 1,
              requiresConfirmation: true,
              risk: "high",
            },
            {
              id: "urgent-help",
              title: "由家庭成员决定是否联系专业救援",
              detail:
                "人工确认联系人、现场位置和已采取措施，不由 AI 自动拨号。",
              tool: "create_task",
              timeoutMinutes: 3,
              requiresConfirmation: true,
              risk: "high",
            },
          ]
        : [
            {
              id: "verify-report",
              title: "核实家庭情况与涉及成员",
              detail: "联系家人核实描述，记录确认结果。",
              tool: "create_task",
              timeoutMinutes: 10,
              requiresConfirmation: true,
              risk: "medium",
            },
            {
              id: "follow-up",
              title: "根据确认结果安排下一步",
              detail: "由家庭成员确定后续行动与责任人。",
              tool: "create_task",
              timeoutMinutes: 20,
              requiresConfirmation: true,
              risk: "medium",
            },
          ],
    recommendedTools: conversationOnly
      ? []
      : ["read_device_state", "create_task", "set_timeout", "write_audit_log"],
    safetyNotice,
    generatedAt: new Date().toISOString(),
  };
}

function parseModelJson(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .slice(0, 8)
    : fallback;
}

function normalizePlan(value: unknown): AgentPlanStep[] {
  if (!Array.isArray(value)) return defaultPlan();
  const plan = value.slice(0, 6).map((item, index) => {
    const raw =
      typeof item === "object" && item ? (item as Record<string, unknown>) : {};
    const risk = ["low", "medium", "high"].includes(String(raw.risk))
      ? (String(raw.risk) as AgentPlanStep["risk"])
      : "medium";
    return {
      id: typeof raw.id === "string" ? raw.id : `step-${index + 1}`,
      title:
        typeof raw.title === "string" ? raw.title : `处理步骤 ${index + 1}`,
      detail:
        typeof raw.detail === "string"
          ? raw.detail
          : "由家庭管理员确认执行细节",
      tool: typeof raw.tool === "string" ? raw.tool : "create_task",
      timeoutMinutes: Number.isFinite(Number(raw.timeoutMinutes))
        ? Math.max(0, Math.min(120, Number(raw.timeoutMinutes)))
        : 5,
      requiresConfirmation: raw.requiresConfirmation !== false,
      risk,
    };
  });
  return plan.length ? plan : defaultPlan();
}

async function callLiveModel(
  query: string,
  memories: FamilyMemory[],
  devices: DeviceState[],
  familyProfile: Record<string, unknown>,
): Promise<AgentAnalysis | null> {
  const apiKey = readRuntimeEnv("AI_API_KEY");
  const model = readRuntimeEnv("AI_MODEL");
  if (!apiKey || !model) return null;
  const baseUrl = (
    readRuntimeEnv("AI_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const promptContext = {
    familyProfile,
    retrievedMemories: memories.map(
      ({ id, member, type, content, source }) => ({
        id,
        member,
        type,
        content,
        source,
      }),
    ),
    smartHomeSignals: devices.map(
      ({ id, name, room, type, state, value, risk, updatedAt, source }) => ({
        id,
        name,
        room,
        type,
        state,
        value,
        risk,
        updatedAt,
        source,
      }),
    ),
  };
  const system = `你是“家有备”家庭应急协调 Agent。你的职责是理解状态、识别缺失信息、生成分级协同计划，不做医疗诊断。\n
必须只输出 JSON，不输出思维链。判断依据只能引用输入、家庭记忆或设备状态。\n
JSON 字段：targetMember, riskLevel(low|medium|high|critical), riskLabel, confidence(0-1), summary, evidence(string[]), missingInformation(string[]), plan([{id,title,detail,tool,timeoutMinutes,requiresConfirmation,risk(low|medium|high)}]), recommendedTools(string[])。\n
可用工具仅限：create_task,set_timeout,update_event_status,write_audit_log,read_device_state,control_device。外部电话、邻居联系、摄像头、门锁和专业救援必须人工确认；绝不建议自动开锁。`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `事件描述：${query}\n\n可用上下文：${JSON.stringify(promptContext)}`,
        },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(`model endpoint returned ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("model returned empty content");
  const raw = parseModelJson(content);
  const allowedRisk = ["low", "medium", "high", "critical"];
  const modelRisk = allowedRisk.includes(String(raw.riskLevel))
    ? (String(raw.riskLevel) as AgentAnalysis["riskLevel"])
    : "medium";
  const deviceAlarm = devices.some((device) => device.risk === "alarm");
  const hardDanger =
    deviceAlarm ||
    /意识不清|呼吸困难|明火|燃气味|摔倒|大量出血|求救|烟雾/.test(query);
  const riskLevel = hardDanger ? "critical" : modelRisk;
  return {
    mode: "live_model",
    model,
    targetMember: knownMemberName(raw.targetMember, familyProfile),
    riskLevel,
    riskLabel: hardDanger
      ? "危险线索 · 立即人工处置"
      : typeof raw.riskLabel === "string"
        ? raw.riskLabel
        : "需要关注",
    confidence: Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, Number(raw.confidence)))
      : 0,
    summary:
      typeof raw.summary === "string"
        ? raw.summary
        : "模型已完成家庭状态分析。",
    evidence: stringArray(raw.evidence, ["已读取家庭档案和设备状态"]),
    missingInformation: stringArray(raw.missingInformation, []),
    memoryRefs: memories.map(({ id, type, content, source }) => ({
      id,
      type,
      content,
      source,
    })),
    deviceSignals: deviceEvidence(devices),
    plan: normalizePlan(raw.plan),
    recommendedTools: stringArray(raw.recommendedTools, [
      "create_task",
      "set_timeout",
      "read_device_state",
    ]),
    safetyNotice,
    generatedAt: new Date().toISOString(),
  };
}

export async function analyzeFamilyEvent(input: {
  familyId: string;
  query: string;
  familyProfile?: Record<string, unknown>;
}) {
  const memories = await retrieveMemories(input.familyId, input.query);
  const smartHome = await getFamilyDeviceSnapshot(input.familyId);
  const fallback = rulesAnalysis(input.query, memories, smartHome.devices);
  if (fallback.riskLevel === "low")
    return {
      analysis: fallback,
      smartHomeDriver: smartHome.driver,
      warning: smartHome.warning,
    };
  try {
    const live = await callLiveModel(
      input.query,
      memories,
      smartHome.devices,
      input.familyProfile ?? {},
    );
    return {
      analysis: live ?? fallback,
      smartHomeDriver: smartHome.driver,
      warning: smartHome.warning,
    };
  } catch (error) {
    return {
      analysis: fallback,
      smartHomeDriver: smartHome.driver,
      warning:
        error instanceof Error ? error.message : "模型调用失败，已使用规则模式",
    };
  }
}
