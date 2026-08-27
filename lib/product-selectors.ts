import type { Authorization, Device, Event, FamilyMember, RiskLevel, Task } from "./product-models";

type DashboardState = {
  members: Pick<FamilyMember, "id">[];
  events: Pick<Event, "id" | "title" | "riskLevel" | "status" | "createdAt">[];
  tasks: Pick<Task, "status">[];
  authorizations: Pick<Authorization, "status" | "riskLevel">[];
  devices: Pick<Device, "online">[];
};

const riskRank: Record<RiskLevel, number> = { normal: 0, attention: 1, warning: 2, critical: 3 };
const activeStatuses = new Set(["monitoring", "pending_confirmation", "processing"]);
const pendingTaskStatuses = new Set(["to_receive", "waiting_confirmation", "overdue"]);

export function selectDashboardSummary(state: DashboardState) {
  const activeEvents = state.events
    .filter((event) => activeStatuses.has(event.status))
    .sort((a, b) => riskRank[b.riskLevel] - riskRank[a.riskLevel] || b.createdAt.localeCompare(a.createdAt));
  const pendingAuthorizations = state.authorizations.filter((authorization) => authorization.status === "pending");
  const topEvent = activeEvents[0];
  const topAuthorizationRisk = pendingAuthorizations.reduce<RiskLevel>((highest, authorization) => riskRank[authorization.riskLevel] > riskRank[highest] ? authorization.riskLevel : highest, "normal");
  const riskLevel: RiskLevel = topEvent && riskRank[topEvent.riskLevel] >= riskRank[topAuthorizationRisk] ? topEvent.riskLevel : topAuthorizationRisk;
  const pendingTaskCount = state.tasks.filter((task) => pendingTaskStatuses.has(task.status)).length;
  const pendingAuthorizationCount = pendingAuthorizations.length;
  const criticalAuthorizationCount = pendingAuthorizations.filter((authorization) => authorization.riskLevel === "critical").length;
  const statusLabel = riskLevel === "critical" ? "家庭状态紧急" : riskLevel === "warning" ? "家庭状态警告" : riskLevel === "attention" ? "家庭状态需关注" : "家庭状态正常";
  const headline = topEvent
    ? `${riskLevel === "critical" ? "紧急" : riskLevel === "warning" ? "警告" : "关注"}：${topEvent.title}`
    : riskLevel === "critical"
      ? `紧急：${criticalAuthorizationCount} 项高风险操作等待确认`
      : "当前家庭状态正常";
  const description = riskLevel === "normal"
    ? `当前没有进行中的异常事件，${pendingTaskCount} 项家庭任务等待处理。`
    : `${activeEvents.length} 个事件正在跟进，${pendingAuthorizationCount} 项操作等待人工确认。`;

  return {
    riskLevel,
    statusLabel,
    headline,
    description,
    topEvent,
    activeEvents,
    memberCount: state.members.length,
    pendingTaskCount,
    pendingAuthorizationCount,
    criticalAuthorizationCount,
    offlineDeviceCount: state.devices.filter((device) => !device.online).length,
    onlineDeviceCount: state.devices.filter((device) => device.online).length,
  };
}
