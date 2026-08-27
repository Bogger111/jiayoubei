export type RiskLevel = "normal" | "attention" | "warning" | "critical";
export type EventStatus = "monitoring" | "pending_confirmation" | "processing" | "resolved" | "closed";
export type TaskStatus = "to_receive" | "in_progress" | "waiting_confirmation" | "completed" | "overdue";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type AuthorizationPolicy = "always_allow" | "ask_every_time" | "always_deny";
export type AuthorizationStatus = "pending" | "approved" | "rejected" | "active";
export type DeviceKind = "security" | "environment" | "lighting" | "lock" | "camera" | "health" | "other";

export type User = { id: string; name: string; role: string; avatar: string; phone: string };
export type Family = { id: string; name: string; ownerId: string; address: string; timezone: string; mode: "mock" | "real" };
export type FamilyMember = { id: string; name: string; relation: string; role: string; avatar: string; online: boolean; location: string; currentTaskId?: string; permissions: string[]; phone: string; emergencyContact: boolean };
export type TimelineEntry = { id: string; time: string; title: string; detail: string; actor: string; tone: "info" | "success" | "warning" | "critical" };
export type Event = { id: string; title: string; description: string; riskLevel: RiskLevel; status: EventStatus; source: string; createdAt: string; updatedAt: string; relatedMembers: string[]; relatedDevices: string[]; relatedTasks: string[]; relatedAuthorizationId?: string; aiAssessment: string; timeline: TimelineEntry[] };
export type Task = { id: string; title: string; description: string; assignee: string; creator: string; sourceEventId: string; priority: TaskPriority; status: TaskStatus; dueAt: string; evidence?: string; evidenceUploadedAt?: string; familyConfirmedAt?: string; helpRequested?: boolean };
export type Authorization = { id: string; action: string; resource: string; riskLevel: RiskLevel; policy: AuthorizationPolicy; requester: string; reason: string; createdAt: string; status: AuthorizationStatus; eventId?: string; consequence: string };
export type Device = { id: string; name: string; kind: DeviceKind; room: string; state: string; reading: string; unit?: string; online: boolean; riskLevel: RiskLevel; lastSync: string; source: "real" | "local" | "simulator"; permission: string; relatedEventIds: string[] };
export type ServiceProvider = { id: string; name: string; category: string; verified: boolean; coverage: string; contact: string; lastUsed: string; trustLevel: "high" | "medium" | "unverified"; note: string };
export type Notification = { id: string; category: "urgent" | "action" | "family" | "system"; title: string; detail: string; time: string; read: boolean; eventId?: string };
export type AuditLog = { id: string; actor: string; actorType: "ai" | "user" | "device" | "rule"; time: string; target: string; action: string; reason: string; riskLevel: RiskLevel; result: "success" | "blocked" | "failed" };
export type AIMessage = { id: string; role: "user" | "assistant"; text: string; createdAt: string; cardType?: "event" | "task" | "risk" | "device" | "authorization"; relatedId?: string };

export type ProductState = {
  family: Family;
  user: User;
  members: FamilyMember[];
  events: Event[];
  tasks: Task[];
  authorizations: Authorization[];
  devices: Device[];
  services: ServiceProvider[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  aiMessages: AIMessage[];
  demoMode: boolean;
  hydrationStatus: "idle" | "loading" | "ready" | "error" | "unauthorized";
  busy: string | null;
  lastError: string | null;
};

export const riskLabel: Record<RiskLevel, string> = { normal: "正常", attention: "关注", warning: "警告", critical: "紧急" };
export const eventStatusLabel: Record<EventStatus, string> = { monitoring: "监测中", pending_confirmation: "待确认", processing: "处理中", resolved: "已解决", closed: "已关闭" };
export const taskStatusLabel: Record<TaskStatus, string> = { to_receive: "待接收", in_progress: "进行中", waiting_confirmation: "等待确认", completed: "已完成", overdue: "超时" };
export const priorityLabel: Record<TaskPriority, string> = { low: "低", medium: "中", high: "高", urgent: "紧急" };
export const policyLabel: Record<AuthorizationPolicy, string> = { always_allow: "始终允许", ask_every_time: "每次询问", always_deny: "始终拒绝" };
