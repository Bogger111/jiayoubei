export type AgentMode = "live_model" | "rules_fallback";

export type FamilyMemory = {
  id: number;
  member: string;
  type: "profile" | "habit" | "event" | "preference";
  content: string;
  source: string;
  importance: number;
  createdAt: string;
};

export type DeviceState = {
  id: string;
  name: string;
  room: string;
  type: "door" | "presence" | "smoke" | "gas" | "temperature" | "light" | "speaker" | "other";
  state: string;
  value: string;
  unit?: string;
  online: boolean;
  risk: "normal" | "attention" | "alarm";
  updatedAt: string;
  source: "simulator" | "home_assistant";
};

export type AgentPlanStep = {
  id: string;
  title: string;
  detail: string;
  tool: string;
  timeoutMinutes: number;
  requiresConfirmation: boolean;
  risk: "low" | "medium" | "high";
};

export type AgentAnalysis = {
  mode: AgentMode;
  model?: string;
  targetMember: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskLabel: string;
  confidence: number;
  summary: string;
  evidence: string[];
  missingInformation: string[];
  memoryRefs: Array<Pick<FamilyMemory, "id" | "type" | "content" | "source">>;
  deviceSignals: Array<Pick<DeviceState, "id" | "name" | "state" | "value" | "risk" | "updatedAt">>;
  plan: AgentPlanStep[];
  recommendedTools: string[];
  safetyNotice: string;
  generatedAt: string;
};

export type ToolName =
  | "create_task"
  | "set_timeout"
  | "update_event_status"
  | "write_audit_log"
  | "read_device_state"
  | "control_device";

export type ToolRun = {
  id: number;
  tool: ToolName;
  status: "success" | "blocked" | "failed";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
};
