import { useSyncExternalStore } from "react";
import type { Authorization, ProductState, RiskLevel } from "./product-models";
import { mockAuthorizations, mockAuditLogs, mockDevices, mockEvents, mockFamily, mockMembers, mockNotifications, mockServices, mockTasks, mockUser } from "./product-mocks";
import { canCompleteTask, isAuthorizationPolicyAllowed } from "./product-policy";
import { agentApi, apiConfig, authorizationApi, eventApi, loadProductState, notificationApi, taskApi } from "@/src/api";
import { ApiError } from "@/src/api/apiClient";

const clone = <T,>(value: T): T => structuredClone(value);
const now = () => new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
let sequence = 1000;

const initialMessages: ProductState["aiMessages"] = [
  { id: "AI001", role: "assistant", text: "你好，我是家有备。告诉我家里发生了什么，我会先理解情况，再给出可解释的协同方案。高风险行为始终需要人工确认。", createdAt: "22:30" },
  { id: "AI002", role: "assistant", text: "当前家庭状态正常，不过有 1 项任务和 1 个高风险授权等待你处理。", createdAt: "22:31", cardType: "risk", relatedId: "E002" },
];

const mockInitialState: ProductState = {
  family: clone(mockFamily), user: clone(mockUser), members: clone(mockMembers), events: clone(mockEvents), tasks: clone(mockTasks), authorizations: clone(mockAuthorizations), devices: clone(mockDevices), services: clone(mockServices), notifications: clone(mockNotifications), auditLogs: clone(mockAuditLogs),
  aiMessages: clone(initialMessages), demoMode: true, hydrationStatus: "ready", busy: null, lastError: null,
};

const realInitialState: ProductState = {
  family: { id: "loading-family", name: "正在连接家庭空间", ownerId: "", address: "", timezone: "Asia/Shanghai", mode: "real" },
  user: { id: "loading-user", name: "家庭成员", role: "正在连接", avatar: "家", phone: "" },
  members: [], events: [], tasks: [], authorizations: [], devices: [], services: [], notifications: [], auditLogs: [],
  aiMessages: clone(initialMessages), demoMode: false, hydrationStatus: "idle", busy: null, lastError: null,
};

const createInitialState = () => clone(apiConfig.useMock ? mockInitialState : realInitialState);

class ProductStore {
  private state = createInitialState();
  private listeners = new Set<() => void>();
  private hydrateVersion = 0;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  private update(mutator: (draft: ProductState) => void) { const draft = clone(this.state); mutator(draft); this.state = draft; this.listeners.forEach((listener) => listener()); }
  audit(actor: string, actorType: "ai" | "user" | "device" | "rule", target: string, action: string, reason: string, result: "success" | "blocked" | "failed" = "success", riskLevel: RiskLevel = result === "blocked" ? "critical" : "normal") { this.update((s) => { s.auditLogs.unshift({ id: `AL${++sequence}`, actor, actorType, time: now(), target, action, reason, riskLevel, result }); }); }
  private touchEvent(eventId: string, title: string, detail: string, actor: string, tone: "info" | "success" | "warning" | "critical" = "info") { this.update((s) => { const e = s.events.find((item) => item.id === eventId); if (!e) return; e.timeline.push({ id: `L${++sequence}`, time: now(), title, detail, actor, tone }); e.updatedAt = new Date().toISOString(); }); }
  setBusy(value: string | null) { this.update((s) => { s.busy = value; }); }
  private sync(operation: Promise<unknown>, description: string) { void operation.catch((error) => { this.update((s) => { s.lastError = `${description}同步失败：${error instanceof Error ? error.message : "未知错误"}。本地演示状态已保留，未执行未确认的外部动作。`; }); }); }
  async hydrate() {
    if (apiConfig.useMock || this.state.hydrationStatus === "loading" || this.state.hydrationStatus === "ready") return;
    const version = ++this.hydrateVersion;
    this.update((s) => { s.hydrationStatus = "loading"; s.busy = "bootstrap"; s.lastError = null; });
    try {
      const data = await loadProductState();
      if (version !== this.hydrateVersion) return;
      const messages = clone(this.state.aiMessages);
      this.state = { ...clone(realInitialState), ...clone(data), aiMessages: messages, demoMode: false, hydrationStatus: "ready", lastError: null, busy: null };
      this.listeners.forEach((listener) => listener());
    } catch (error) {
      if (version !== this.hydrateVersion) return;
      this.update((s) => {
        s.busy = null;
        if (error instanceof ApiError && error.status === 401) {
          s.hydrationStatus = "unauthorized";
          s.lastError = "需要登录后才能查看家庭空间。";
        } else {
          s.hydrationStatus = "error";
          s.lastError = `真实 API 连接失败：${error instanceof Error ? error.message : "未知错误"}。未执行任何外部动作。`;
        }
      });
    }
  }
  retryHydrate() { if (apiConfig.useMock) return; this.hydrateVersion += 1; this.update((s) => { s.hydrationStatus = "idle"; s.busy = null; }); void this.hydrate(); }
  clearError() { this.update((s) => { s.lastError = null; }); }
  markNotificationRead(id?: string) { this.update((s) => { s.notifications.forEach((n) => { if (!id || n.id === id) n.read = true; }); }); this.sync(notificationApi.markRead(id), "通知状态"); }
  triggerDemo(kind: "elderly" | "stranger" | "smoke" | "pet" | "offline" | "normal" | "failure") {
    this.update((s) => {
      if (kind === "elderly") {
        const e = s.events.find((x) => x.id === "E001")!; e.status = "processing"; e.riskLevel = "attention"; e.updatedAt = new Date().toISOString(); e.timeline.push({ id: `L${++sequence}`, time: now(), title: "Demo 触发：老人长时间未活动", detail: "系统重新读取家庭档案和设备信号。", actor: "Demo 控制台", tone: "warning" });
        const t = s.tasks.find((x) => x.id === "T001")!; t.status = "waiting_confirmation";
        s.notifications.unshift({ id: `N${++sequence}`, category: "action", title: "老人长时间未活动", detail: "AI 已创建联系老人任务，等待你确认推进。", time: "刚刚", read: false, eventId: "E001" });
      } else if (kind === "stranger") {
        const e = s.events.find((x) => x.id === "E002")!; e.status = "pending_confirmation"; e.riskLevel = "critical"; e.timeline.push({ id: `L${++sequence}`, time: now(), title: "Demo 触发：陌生人请求开门", detail: "AI 建议核对身份，但门锁动作被安全规则挂起。", actor: "Demo 控制台", tone: "critical" });
        const a = s.authorizations.find((x) => x.id === "A004")!; a.status = "pending"; a.createdAt = new Date().toISOString();
        s.notifications.unshift({ id: `N${++sequence}`, category: "urgent", title: "陌生访客请求入户", detail: "门锁未执行，等待你的人工授权。", time: "刚刚", read: false, eventId: "E002" });
      } else if (kind === "smoke") {
        const d = s.devices.find((x) => x.id === "D003")!; d.riskLevel = "warning"; d.state = "alarm"; d.reading = "检测到烟雾波动"; const e = s.events.find((x) => x.id === "E003")!; e.status = "monitoring"; e.riskLevel = "warning"; e.timeline.push({ id: `L${++sequence}`, time: now(), title: "Demo 触发：烟雾告警", detail: "硬告警优先，等待人工复核。", actor: "Demo 控制台", tone: "critical" }); s.notifications.unshift({ id: `N${++sequence}`, category: "urgent", title: "厨房烟雾异常", detail: "硬告警已升级，请尽快人工复核。", time: "刚刚", read: false, eventId: "E003" });
      } else if (kind === "pet") { const t = s.tasks.find((x) => x.id === "T004")!; t.status = "overdue"; s.notifications.unshift({ id: `N${++sequence}`, category: "action", title: "宠物喂食任务超时", detail: "请联系临时照护者并请求照片证据。", time: "刚刚", read: false, eventId: "E004" }); }
      else if (kind === "offline") { const d = s.devices.find((x) => x.id === "D008")!; d.online = false; d.riskLevel = "attention"; s.notifications.unshift({ id: `N${++sequence}`, category: "system", title: "老人智能药盒离线", detail: "最后同步于 48 分钟前。", time: "刚刚", read: false }); }
      else if (kind === "failure") { s.lastError = "AI 服务暂不可用，已切换到规则降级模式；没有执行外部动作。"; }
      else { s.notifications.unshift({ id: `N${++sequence}`, category: "family", title: "家庭状态检查完成", detail: "所有低风险信号已完成同步。", time: "刚刚", read: false }); }
    });
    if (kind === "elderly") this.audit("Demo 控制台", "user", "E001 老人长时间未活动", "触发演示事件", "课程演示：测试事件—任务闭环");
    if (kind === "stranger") this.audit("安全规则", "rule", "D005 入户智能门锁", "拦截自动开锁请求", "门锁属于 Critical 高风险动作", "blocked");
    if (kind === "smoke") this.audit("厨房烟雾报警器", "device", "E003 厨房烟雾异常", "上报硬告警", "读数超过关注阈值");
  }
  async confirmAuthorization(id: string, decision: "approve" | "reject"): Promise<boolean> {
    const auth = this.state.authorizations.find((x) => x.id === id); if (!auth) return false;
    const actor = this.state.user.name;
    this.setBusy(`authorization:${id}`);
    try {
      await authorizationApi.decide(id, decision);
      this.update((s) => {
        const a = s.authorizations.find((x) => x.id === id)!; a.status = decision === "approve" ? "approved" : "rejected";
        if (a.eventId) { const e = s.events.find((x) => x.id === a.eventId)!; e.status = decision === "approve" ? "processing" : "resolved"; e.timeline.push({ id: `L${++sequence}`, time: now(), title: decision === "approve" ? "人工确认：仅此次允许" : "操作已拦截", detail: decision === "approve" ? "本次确认不改变长期授权规则。" : "门锁未执行，未授权人员没有进入家庭。", actor, tone: decision === "approve" ? "success" : "critical" }); }
        if (a.eventId === "E002") { const t = s.tasks.find((x) => x.id === "T003"); if (t) t.status = decision === "approve" ? "in_progress" : "completed"; }
        s.notifications = s.notifications.filter((n) => n.eventId !== a.eventId);
      });
      this.audit(actor, "user", `${id} ${auth.resource}`, decision === "approve" ? "允许本次操作" : "拒绝高风险操作", auth.reason, decision === "approve" ? "success" : "blocked");
      return true;
    } catch (error) {
      this.update((s) => { s.lastError = `授权提交失败：${error instanceof Error ? error.message : "未知错误"}。设备未执行任何动作。`; });
      this.audit("家有备", "rule", `${id} ${auth.resource}`, "授权提交失败", "真实 API 未确认，保持设备安全状态", "failed", auth.riskLevel);
      return false;
    } finally { this.setBusy(null); }
  }
  uploadTaskEvidence(id: string): boolean { const task = this.state.tasks.find((item) => item.id === id); if (!task) return false; const actor = this.state.user.name; const evidenceUploadedAt = new Date().toISOString(); this.update((s) => { const target = s.tasks.find((item) => item.id === id)!; target.evidence = "已上传现场照片（Mock），包含拍摄时间与上传人。"; target.evidenceUploadedAt = evidenceUploadedAt; if (target.status !== "completed") target.status = "waiting_confirmation"; }); this.sync(taskApi.update(id, { evidence: "已上传现场照片（Mock），包含拍摄时间与上传人。", evidenceUploadedAt, status: "waiting_confirmation" }), "任务证据"); this.audit(actor, "user", id, "上传任务完成证据", "证据已保存，仍需家庭成员确认", "success", task.priority === "urgent" ? "critical" : "attention"); return true; }
  updateTask(id: string, action: "accept" | "complete" | "help"): boolean { const current = this.state.tasks.find((item) => item.id === id); if (!current) return false; const actor = this.state.user.name; if (action === "complete" && !canCompleteTask(current)) { this.audit("安全规则", "rule", id, "拦截无证据完成任务", "任务必须先上传完成证据，再由家庭成员确认", "blocked", current.priority === "urgent" ? "critical" : "attention"); return false; } this.update((s) => { const t = s.tasks.find((x) => x.id === id)!; if (action === "accept") t.status = "in_progress"; if (action === "complete") { t.status = "completed"; t.familyConfirmedAt = new Date().toISOString(); const event = s.events.find((item) => item.id === t.sourceEventId); if (event) { event.timeline.push({ id: `L${++sequence}`, time: now(), title: "任务完成已回传", detail: `${t.title}已由${actor}核对证据并确认完成。`, actor, tone: "success" }); event.updatedAt = new Date().toISOString(); const allTasksComplete = s.tasks.filter((item) => item.sourceEventId === event.id).every((item) => item.status === "completed"); if (allTasksComplete && event.status !== "pending_confirmation" && event.status !== "closed") event.status = "resolved"; } } if (action === "help") t.helpRequested = true; s.notifications = s.notifications.filter((n) => n.eventId !== t.sourceEventId || action !== "complete"); }); const task = this.state.tasks.find((x) => x.id === id); if (task) this.sync(taskApi.update(id, { status: task.status, evidence: task.evidence, evidenceUploadedAt: task.evidenceUploadedAt, familyConfirmedAt: task.familyConfirmedAt, helpRequested: task.helpRequested }), "任务状态"); if (action === "complete") { const relatedEvent = this.state.events.find((event) => event.id === current.sourceEventId); if (relatedEvent) this.sync(eventApi.update(relatedEvent.id, { status: relatedEvent.status, updatedAt: relatedEvent.updatedAt, timeline: relatedEvent.timeline }), "事件状态回传"); } this.audit(actor, "user", id, action === "complete" ? "确认任务完成" : action === "help" ? "请求家庭成员帮助" : "接受家庭任务", action === "complete" ? "已核对完成证据并进行家庭确认" : "家庭成员主动操作", "success", current.priority === "urgent" ? "critical" : "attention"); return true; }
  transferTask(id: string, assignee = "M005") { const actor = this.state.user.name; this.update((s) => { const t = s.tasks.find((x) => x.id === id); if (t) { t.assignee = assignee; t.status = "to_receive"; } }); this.sync(taskApi.update(id, { assignee, status: "to_receive" }), "任务转交"); this.audit(actor, "user", id, "转交家庭任务", `新负责人：${assignee}`); }
  advanceEvent(id: string) {
    const actor = this.state.user.name;
    this.update((s) => {
      const e = s.events.find((x) => x.id === id);
      if (!e || e.status === "resolved" || e.status === "closed") return;
      const steps = [
        { title: "安全确认消息已发送", detail: "已进入家庭成员确认通道。", tone: "info" as const },
        { title: "超时规则触发升级", detail: "10 分钟无响应，已提醒管理员电话联系。", tone: "warning" as const },
        { title: "邻居完成上门确认", detail: "王阿姨反馈林阿姨在午睡，状态正常。", tone: "success" as const },
        { title: "事件已解决", detail: "已通知家庭成员并保留完整审计记录。", tone: "success" as const },
      ];
      const completed = e.timeline.filter((entry) => steps.some((step) => step.title === entry.title)).length;
      const index = Math.min(steps.length - 1, completed);
      const step = steps[index];
      e.timeline.push({ id: `L${++sequence}`, time: now(), title: step.title, detail: step.detail, actor, tone: step.tone });
      e.status = index >= 3 ? "resolved" : "processing";
      e.updatedAt = new Date().toISOString();
      if (index >= 3) {
        s.notifications = s.notifications.filter((n) => n.eventId !== id);
        s.tasks.filter((task) => task.sourceEventId === id).forEach((task) => {
          task.status = "completed";
          task.evidence = task.evidence ?? "邻居已完成上门安全确认，家庭成员确认状态正常。";
          task.familyConfirmedAt = new Date().toISOString();
        });
      }
    });
    this.audit(actor, "user", id, "推进事件处理步骤", "Demo 场景人工确认");
    const event = this.state.events.find((x) => x.id === id); if (event) this.sync(eventApi.update(id, { status: event.status, updatedAt: event.updatedAt, timeline: event.timeline }), "事件状态");
  }
  setAuthorizationPolicy(id: string, policy: Authorization["policy"]): boolean { const auth = this.state.authorizations.find((x) => x.id === id); if (!auth || auth.status === "pending") return false; const actor = this.state.user.name; if (!isAuthorizationPolicyAllowed(auth, policy)) { this.audit("安全规则", "rule", `${id} ${auth.resource}`, "拦截越权授权规则", "Critical 与受保护资源不能设置为始终允许", "blocked", auth.riskLevel); return false; } this.update((s) => { const a = s.authorizations.find((x) => x.id === id); if (a) a.policy = policy; }); this.sync(authorizationApi.updatePolicy(id, policy), "授权规则"); this.audit(actor, "user", id, "修改授权规则", "家庭管理员调整长期授权边界", "success", auth.riskLevel); return true; }
  async sendMessage(text: string): Promise<void> { const value = text.trim(); if (!value) return; this.update((s) => { s.aiMessages.push({ id: `AI${++sequence}`, role: "user", text: value, createdAt: now() }); s.busy = "agent"; }); try { const result = await agentApi.analyze(value); this.update((s) => { s.aiMessages.push({ id: `AI${++sequence}`, role: "assistant", text: result.text, createdAt: now(), cardType: result.cardType, relatedId: result.relatedId }); s.busy = null; s.lastError = null; }); if (result.eventId || (result.taskIds && result.taskIds.length > 0)) void this.retryHydrate(); } catch (error) { this.update((s) => { s.busy = null; s.lastError = `AI 服务暂不可用：${error instanceof Error ? error.message : "未知错误"}。已切换规则降级模式，未执行任何外部动作。`; s.aiMessages.push({ id: `AI${++sequence}`, role: "assistant", text: "AI 分析暂时不可用。我已切换到确定性安全规则：保留当前事件、暂停全部外部动作，并等待家庭成员人工处理。", createdAt: now(), cardType: "risk" }); }); } }
  resetConversation() { this.update((s) => { s.aiMessages = clone(initialMessages); s.lastError = null; s.busy = null; }); }
  reset() { this.hydrateVersion += 1; this.state = createInitialState(); this.listeners.forEach((listener) => listener()); if (!apiConfig.useMock) void this.hydrate(); }
}

export const productStore = new ProductStore();
export const useProductStore = () => useSyncExternalStore(productStore.subscribe, productStore.getSnapshot, productStore.getSnapshot);
export type Store = ProductStore;
