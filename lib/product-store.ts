import { useSyncExternalStore } from "react";
import { approveCarePlan, claimCareStep, createCarePlan, demoCareSignals, recordCareStep, resolveCarePlan, reviseCarePlan, type CareScenario, type CareOutcomeInput } from "./care-agent";
import { careApi } from "@/src/api/careApi";
import type {
  Authorization,
  FamilyMember,
  Device,
  ServiceProvider,
  ProductState,
  RiskLevel,
  Task,
} from "./product-models";
import {
  mockAuthorizations,
  mockAuditLogs,
  mockDevices,
  mockEvents,
  mockFamily,
  mockMembers,
  mockNotifications,
  mockServices,
  mockTasks,
  mockUser,
} from "./product-mocks";
import {
  canCompleteTask,
  isAuthorizationPolicyAllowed,
} from "./product-policy";
import {
  agentApi,
  apiConfig,
  authorizationApi,
  eventApi,
  loadProductState,
  notificationApi,
  taskApi,
} from "@/src/api";
import {
  memberInput,
  deviceInput,
  serviceInput,
  familyInput,
} from "./resource-input";
import { ApiError, apiRequest, mockDelay } from "@/src/api/apiClient";
import { taskCreateInput } from "./task-create-input";
import { clearTaskDrafts } from "./task-drafts";
import { currentMember } from "./current-member";

const clone = <T>(value: T): T => structuredClone(value);
const now = () =>
  new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
let sequence = 1000;

const initialMessages: ProductState["aiMessages"] = [
  {
    id: "AI001",
    role: "assistant",
    text: "你好，我是家有备。告诉我家里发生了什么，我会先理解情况，再给出可解释的协同方案。高风险行为始终需要人工确认。",
    createdAt: "系统提示",
  },
];

const mockInitialState: ProductState = {
  carePlan: createCarePlan(demoCareSignals()),
  family: clone(mockFamily),
  user: clone(mockUser),
  members: clone(mockMembers),
  events: clone(mockEvents),
  tasks: clone(mockTasks),
  authorizations: clone(mockAuthorizations),
  devices: clone(mockDevices),
  services: clone(mockServices),
  notifications: clone(mockNotifications),
  auditLogs: clone(mockAuditLogs),
  aiMessages: clone(initialMessages),
  demoMode: true,
  hydrationStatus: "ready",
  busy: null,
  lastError: null,
};

const realInitialState: ProductState = {
  family: {
    id: "loading-family",
    name: "正在连接家庭空间",
    ownerId: "",
    address: "",
    timezone: "Asia/Shanghai",
    mode: "real",
  },
  user: {
    id: "loading-user",
    name: "家庭成员",
    role: "正在连接",
    avatar: "家",
    phone: "",
  },
  members: [],
  events: [],
  tasks: [],
  authorizations: [],
  devices: [],
  services: [],
  notifications: [],
  auditLogs: [],
  aiMessages: clone(initialMessages),
  demoMode: false,
  hydrationStatus: "idle",
  busy: null,
  lastError: null,
};

const createInitialState = () =>
  clone(apiConfig.useMock ? mockInitialState : realInitialState);

class ProductStore {
  private state = createInitialState();
  private listeners = new Set<() => void>();
  private hydrateVersion = 0;
  private sessionVersion = 0;
  private assertSession(version: number) {
    if (version !== this.sessionVersion)
      throw new Error("账号会话已变更，请重新登录后继续。");
  }
  private writeVersion = 0;
  private recordsRefresh: Promise<void> | null = null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  private update(mutator: (draft: ProductState) => void) {
    const draft = clone(this.state);
    mutator(draft);
    this.state = draft;
    this.listeners.forEach((listener) => listener());
  }
  audit(
    actor: string,
    actorType: "ai" | "user" | "device" | "rule",
    target: string,
    action: string,
    reason: string,
    result: "success" | "blocked" | "failed" = "success",
    riskLevel: RiskLevel = result === "blocked" ? "critical" : "normal",
  ) {
    this.update((s) => {
      s.auditLogs.unshift({
        id: `AL${++sequence}`,
        actor,
        actorType,
        time: now(),
        target,
        action,
        reason,
        riskLevel,
        result,
      });
    });
  }
  private touchEvent(
    eventId: string,
    title: string,
    detail: string,
    actor: string,
    tone: "info" | "success" | "warning" | "critical" = "info",
  ) {
    this.update((s) => {
      const e = s.events.find((item) => item.id === eventId);
      if (!e) return;
      e.timeline.push({
        id: `L${++sequence}`,
        time: now(),
        title,
        detail,
        actor,
        tone,
      });
      e.updatedAt = new Date().toISOString();
    });
  }
  setBusy(value: string | null) {
    if (value) this.writeVersion += 1;
    this.update((s) => {
      s.busy = value;
    });
  }
  private sync(operation: Promise<unknown>, description: string) {
    const session = this.sessionVersion;
    void operation.catch((error) => {
      if (session !== this.sessionVersion) return;
      this.update((s) => {
        s.lastError = `${description}同步失败：${error instanceof Error ? error.message : "未知错误"}。本地演示状态已保留，未执行未确认的外部动作。`;
      });
    });
  }
  async hydrate() {
    if (
      apiConfig.useMock ||
      this.state.hydrationStatus === "loading" ||
      this.state.hydrationStatus === "ready"
    )
      return;
    const version = ++this.hydrateVersion;
    this.recordsRefresh = null;
    this.update((s) => {
      s.recordsRefreshing = false;
      s.hydrationStatus = "loading";
      s.busy = "bootstrap";
      s.lastError = null;
    });
    try {
      const data = await loadProductState();
      if (version !== this.hydrateVersion) return;
      const identityChanged =
        this.state.user.id !== "loading-user" &&
        (data.user.id !== this.state.user.id ||
          data.family.id !== this.state.family.id);
      if (identityChanged) {
        clearTaskDrafts(this.state.user.id, this.state.family.id);
        this.sessionVersion += 1;
      }
      const messages = clone(
        identityChanged ? initialMessages : this.state.aiMessages,
      );
      this.state = {
        ...clone(realInitialState),
        ...clone(data),
        aiMessages: messages,
        demoMode: false,
        hydrationStatus: "ready",
        lastError: null,
        busy: null,
        recordsUpdatedAt: new Date().toISOString(),
        recordsSyncError: null,
      };
      this.listeners.forEach((listener) => listener());
    } catch (error) {
      if (version !== this.hydrateVersion) return;
      if (error instanceof ApiError && error.status === 401) {
        this.endSession();
        return;
      }
      this.update((s) => {
        s.busy = null;
        s.hydrationStatus = "error";
        s.lastError = `真实 API 连接失败：${error instanceof Error ? error.message : "未知错误"}。未执行任何外部动作。`;
      });
    }
  }
  retryHydrate() {
    if (apiConfig.useMock) return;
    this.hydrateVersion += 1;
    this.update((s) => {
      s.hydrationStatus = "idle";
      s.busy = null;
    });
    void this.hydrate();
  }
  /** Refresh shared records without remounting editors or interrupting visual monitoring. */
  refreshRecords(): Promise<void> {
    if (
      apiConfig.useMock ||
      this.state.hydrationStatus !== "ready" ||
      this.state.busy
    )
      return Promise.resolve();
    if (this.recordsRefresh) return this.recordsRefresh;
    const hydration = this.hydrateVersion;
    const writes = this.writeVersion;
    this.update((state) => {
      state.recordsRefreshing = true;
    });
    const refresh: Promise<void> = (async () => {
      try {
        const data = await loadProductState();
        if (
          hydration !== this.hydrateVersion ||
          writes !== this.writeVersion ||
          this.state.busy ||
          this.state.hydrationStatus !== "ready"
        )
          return;
        if (
          data.user.id !== this.state.user.id ||
          data.family.id !== this.state.family.id
        ) {
          this.endSession();
          return;
        }
        this.update((state) => {
          Object.assign(state, clone(data));
          state.recordsUpdatedAt = new Date().toISOString();
          state.recordsSyncError = null;
        });
      } catch (error) {
        if (hydration !== this.hydrateVersion || writes !== this.writeVersion)
          return;
        if (error instanceof ApiError && error.status === 401) {
          this.endSession();
          return;
        }
        this.update((state) => {
          state.recordsSyncError =
            "暂时无法获取家人的最新记录，当前显示上次成功加载的内容。";
        });
      } finally {
        if (hydration === this.hydrateVersion)
          this.update((state) => {
            this.recordsRefresh = null;
            state.recordsRefreshing = false;
          });
      }
    })();
    this.recordsRefresh = refresh;
    return refresh;
  }
  clearError() {
    this.update((s) => {
      s.lastError = null;
    });
  }
  prepareCareScenario(scenario: CareScenario) {
    if (!this.state.demoMode || this.state.busy) return;
    this.update(s => { s.carePlan = createCarePlan(demoCareSignals(scenario)); });
  }
  async reviseCare(contact: string, waitMinutes: number) {
    if (!this.state.carePlan || this.state.busy) return;
    if (!this.state.members.some(member => member.id === contact)) throw new Error("请选择当前家庭的联系人。");
    if (!this.state.demoMode) return this.saveCareCommand({action:"revise",contact,waitMinutes});
    this.update(s => { s.carePlan = reviseCarePlan(s.carePlan!, contact, waitMinutes); });
  }
  async approveCare() {
    if (!this.state.carePlan || this.state.busy) return;
    if (!this.state.demoMode) return this.saveCareCommand({action:"approve"});
    const session = this.sessionVersion;
    const plan = approveCarePlan(this.state.carePlan, this.state.user.name);
    this.setBusy("care");
    this.update(s => { s.carePlan = plan; });
    try {
      await mockDelay(450);
      if (session !== this.sessionVersion) return;
      const light = this.state.devices.find(device => device.id === "D007");
      const online = Boolean(light?.online && plan.signals.online);
      const withDevice = recordCareStep(plan, "device", online, online ? "本地设备模拟器回执：客厅灯已亮，语音询问已发出" : "设备没有返回成功回执，继续请家人确认");
      const following = recordCareStep(withDevice, "family", true, "已创建家庭联系任务与站内通知，等待家人接手");
      this.update(s => {
        s.carePlan = following;
        const at = new Date().toISOString();
        const taskId = `${plan.id}-CONTACT`;
        s.events.unshift({ id: plan.id, title: "妈妈暂未回应 · 家庭确认", description: plan.reason, riskLevel: "attention", status: "processing", source: "情景回放 · 多模态规则编排", createdAt: at, updatedAt: at, relatedMembers: ["M001", plan.contact], relatedDevices: ["D001", "D002", "D007"], relatedTasks: [taskId], aiAssessment: plan.reason, timeline: [
          { id: `${plan.id}-APPROVAL`, time: at, title: "家人批准完整计划", detail: `${plan.approvedBy} 确认第 ${plan.revision} 版计划；等待 ${plan.waitMinutes} 分钟后再请求附近联系人`, actor: plan.approvedBy!, tone: "info" },
          ...following.steps.filter(step => step.at).map(step => ({ id: `${plan.id}-${step.id}`, time: new Date(step.at!).toISOString(), title: step.title, detail: step.detail!, actor: "家有备 · 本地演示", tone: step.status === "failed" ? "warning" as const : "success" as const })),
        ] });
        s.tasks.unshift({ id: taskId, title: "联系妈妈并记录回应", description: `先联系妈妈；${plan.waitMinutes} 分钟后仍无回应，再安排附近联系人。`, assignee: plan.contact, creator: "家有备 AI", sourceEventId: plan.id, priority: "high", status: "to_receive", dueAt: new Date(following.nextCheckAt!).toISOString() });
        s.notifications.unshift({ id: `${plan.id}-NOTICE`, title: "家庭确认计划已开始", detail: "联系任务已创建，等待家人接手。", category: "family", time: at, read: false, eventId: plan.id, taskId });
        if (online) { const device = s.devices.find(item => item.id === "D007")!; device.state = "on"; device.reading = "已开启（本地模拟回执）"; }
      });
      this.audit(this.state.user.name, "user", plan.id, "批准家庭确认计划", "本地情景回放，执行回执已记录");
    } catch (error) {
      if (session === this.sessionVersion) this.update(s => { s.lastError = error instanceof Error ? error.message : "计划执行失败，请检查记录。"; });
    } finally { if (session === this.sessionVersion) this.setBusy(null); }
  }
  async saveCareCommand(input: Record<string,unknown>) {
    const current=this.state.carePlan;if(!current)return;
    const session=this.sessionVersion;
    this.setBusy("care");
    try{const plan=await careApi.command({...input,caseId:current.id,expectedVersion:current.revision});if(session===this.sessionVersion)this.update(s=>{s.carePlan=plan});}
    finally{if(session===this.sessionVersion)this.setBusy(null);}
    if(session===this.sessionVersion)await this.refreshRecords();
  }
  async claimCare() {
    if(!this.state.carePlan||this.state.busy)return;
    if(!this.state.demoMode)return this.saveCareCommand({action:"claim"});
    const plan=claimCareStep(this.state.carePlan,this.state.user.name);
    this.update(s=>{s.carePlan=plan;for(const task of s.tasks.filter(t=>t.sourceEventId===plan.id&&t.status==="to_receive"))task.status="in_progress";});
  }
  async resolveCare(outcome: Omit<CareOutcomeInput,"actor"|"caseId">) {
    if (!this.state.carePlan || this.state.busy) return;
    if(!this.state.demoMode)return this.saveCareCommand({action:"outcome",outcome});
    const plan = resolveCarePlan(this.state.carePlan, { ...outcome,actor:this.state.user.name,caseId:this.state.carePlan.id });
    this.update(s => {
      s.carePlan = plan;
      const at = new Date().toISOString();
      const event = s.events.find(item => item.id === plan.id);
      if (event) { event.status = plan.status==="resolved"?"resolved":plan.status==="cancelled"?"closed":"processing"; event.updatedAt = at; event.timeline.push({ id: `${plan.id}-REPLY-${plan.revision}`, time: at, title: plan.status==="resolved"?"家人已确认情况":"家人更新核实结果", detail: outcome.remark, actor: s.user.name, tone: plan.status==="resolved"?"success":"warning" }); }
      for (const task of s.tasks.filter(item => item.sourceEventId === plan.id)) { const completed=plan.status==="resolved"&&task.id===`${plan.id}-CONTACT`&&plan.steps.find(step=>step.id==="family")?.status==="done"; task.status = completed?"completed":["resolved","cancelled"].includes(plan.status)?"cancelled":task.status; task.evidence = outcome.remark; if(completed)task.familyConfirmedAt=at; }
    });
    this.audit(this.state.user.name, "user", plan.id, "记录家人回应", outcome.remark);
  }
  advanceCare() {
    const plan = this.state.carePlan;
    if (!this.state.demoMode || this.state.busy || !plan || plan.status !== "following" || Date.now() < (plan.nextCheckAt ?? Infinity) || plan.steps.find(step => step.id === "nearby")?.status !== "pending") return;
    const nearby = this.state.members.find(member => member.relation === "邻居" && member.emergencyContact);
    const updated = recordCareStep(plan, "nearby", Boolean(nearby), nearby ? "等待时间已到，已创建附近联系人的核实任务" : "没有可用的附近联系人，请家人继续联系");
    this.update(s => {
      s.carePlan = updated;
      const at = new Date().toISOString();
      const event = s.events.find(item => item.id === plan.id);
      if (nearby) {
        const id = `${plan.id}-NEARBY`;
        s.tasks.unshift({ id, title: "请协助核实妈妈当前情况", description: "等待时间已到，家人仍未记录回应，请先联系家庭管理员再核实情况。", assignee: nearby.id, creator: "家有备 AI", sourceEventId: plan.id, priority: "high", status: "to_receive", dueAt: new Date(Date.now() + 10 * 60_000).toISOString() });
        event?.relatedTasks.push(id);
      }
      event?.timeline.push({ id: `${plan.id}-TIMEOUT`, time: at, title: "等待期限到达", detail: updated.steps.at(-1)!.detail!, actor: "家有备 · 本地演示", tone: "warning" });
      s.notifications.unshift({ id: `${plan.id}-TIMEOUT`, category: "action", title: nearby ? "已安排附近联系人协助核实" : "请家人继续确认情况", detail: updated.steps.at(-1)!.detail!, time: at, read: false, eventId: plan.id });
    });
    this.audit("家有备", "rule", plan.id, "按计划推进附近核实", "本地任务已更新，外部通讯未接入");
  }
  captureSession() {
    const version = this.sessionVersion;
    return () => version === this.sessionVersion;
  }
  endSession() {
    clearTaskDrafts(this.state.user.id, this.state.family.id);
    this.hydrateVersion += 1;
    this.sessionVersion += 1;
    this.recordsRefresh = null;
    this.state = {
      ...clone(realInitialState),
      hydrationStatus: "unauthorized",
    };
    this.listeners.forEach((listener) => listener());
  }
  async markNotificationRead(id?: string) {
    if (this.state.busy) return false;
    const session = this.sessionVersion;
    this.setBusy("notifications");
    try {
      await notificationApi.markRead(id);
      if (session !== this.sessionVersion) return false;
      this.update((s) => {
        s.notifications.forEach((n) => {
          if (!id || n.id === id) n.read = true;
        });
      });
      return true;
    } catch (error) {
      if (session !== this.sessionVersion) return false;
      if (error instanceof ApiError && error.status === 401) {
        this.endSession();
        return false;
      }
      this.update((s) => {
        s.lastError = `通知状态未保存：${error instanceof Error ? error.message : "请稍后重试"}`;
      });
      return false;
    } finally {
      if (session === this.sessionVersion) this.setBusy(null);
    }
  }
  triggerDemo(
    kind:
      | "elderly"
      | "stranger"
      | "smoke"
      | "pet"
      | "offline"
      | "normal"
      | "failure",
  ) {
    this.update((s) => {
      if (kind === "elderly") {
        const e = s.events.find((x) => x.id === "E001")!;
        e.status = "processing";
        e.riskLevel = "attention";
        e.updatedAt = new Date().toISOString();
        e.timeline.push({
          id: `L${++sequence}`,
          time: now(),
          title: "Demo 触发：老人长时间未活动",
          detail: "系统重新读取家庭档案和设备信号。",
          actor: "Demo 控制台",
          tone: "warning",
        });
        const t = s.tasks.find((x) => x.id === "T001")!;
        t.status = "waiting_confirmation";
        s.notifications.unshift({
          id: `N${++sequence}`,
          category: "action",
          title: "老人长时间未活动",
          detail: "AI 已创建联系老人任务，等待你确认推进。",
          time: "刚刚",
          read: false,
          eventId: "E001",
        });
      } else if (kind === "stranger") {
        const e = s.events.find((x) => x.id === "E002")!;
        e.status = "pending_confirmation";
        e.riskLevel = "critical";
        e.timeline.push({
          id: `L${++sequence}`,
          time: now(),
          title: "Demo 触发：陌生人请求开门",
          detail: "AI 建议核对身份，但门锁动作被安全规则挂起。",
          actor: "Demo 控制台",
          tone: "critical",
        });
        const a = s.authorizations.find((x) => x.id === "A004")!;
        a.status = "pending";
        a.createdAt = new Date().toISOString();
        s.notifications.unshift({
          id: `N${++sequence}`,
          category: "urgent",
          title: "陌生访客请求入户",
          detail: "门锁未执行，等待你的人工授权。",
          time: "刚刚",
          read: false,
          eventId: "E002",
        });
      } else if (kind === "smoke") {
        const d = s.devices.find((x) => x.id === "D003")!;
        d.riskLevel = "warning";
        d.state = "alarm";
        d.reading = "检测到烟雾波动";
        const e = s.events.find((x) => x.id === "E003")!;
        e.status = "monitoring";
        e.riskLevel = "warning";
        e.timeline.push({
          id: `L${++sequence}`,
          time: now(),
          title: "Demo 触发：烟雾告警",
          detail: "硬告警优先，等待人工复核。",
          actor: "Demo 控制台",
          tone: "critical",
        });
        s.notifications.unshift({
          id: `N${++sequence}`,
          category: "urgent",
          title: "厨房烟雾异常",
          detail: "硬告警已升级，请尽快人工复核。",
          time: "刚刚",
          read: false,
          eventId: "E003",
        });
      } else if (kind === "pet") {
        const t = s.tasks.find((x) => x.id === "T004")!;
        t.status = "overdue";
        s.notifications.unshift({
          id: `N${++sequence}`,
          category: "action",
          title: "宠物喂食任务超时",
          detail: "请联系临时照护者并请求照片证据。",
          time: "刚刚",
          read: false,
          eventId: "E004",
        });
      } else if (kind === "offline") {
        const d = s.devices.find((x) => x.id === "D008")!;
        d.online = false;
        d.riskLevel = "attention";
        s.notifications.unshift({
          id: `N${++sequence}`,
          category: "system",
          title: "老人智能药盒离线",
          detail: "最后同步于 48 分钟前。",
          time: "刚刚",
          read: false,
        });
      } else if (kind === "failure") {
        s.lastError =
          "AI 服务暂不可用，已切换到规则降级模式；没有执行外部动作。";
      } else {
        s.notifications.unshift({
          id: `N${++sequence}`,
          category: "family",
          title: "家庭状态检查完成",
          detail: "所有低风险信号已完成同步。",
          time: "刚刚",
          read: false,
        });
      }
    });
    if (kind === "elderly")
      this.audit(
        "Demo 控制台",
        "user",
        "E001 老人长时间未活动",
        "触发演示事件",
        "课程演示：测试事件—任务闭环",
      );
    if (kind === "stranger")
      this.audit(
        "安全规则",
        "rule",
        "D005 入户智能门锁",
        "拦截自动开锁请求",
        "门锁属于 Critical 高风险动作",
        "blocked",
      );
    if (kind === "smoke")
      this.audit(
        "厨房烟雾报警器",
        "device",
        "E003 厨房烟雾异常",
        "上报硬告警",
        "读数超过关注阈值",
      );
  }
  async reportVisionFall(
    source: "camera" | "video",
    torsoAngle: number,
    hipDrop: number,
    ruleEvidence?: import("./cv/report-input").VisionRuleEvidence,
  ): Promise<string> {
    if (!apiConfig.useMock) {
      const session = this.sessionVersion;
      this.writeVersion += 1;
      const result = await apiRequest<{ eventId: string }>("/api/cv/fall", {
        method: "POST",
        body: JSON.stringify({ source, torsoAngle, hipDrop, ...ruleEvidence }),
      }).catch((error) => {
        if (
          session === this.sessionVersion &&
          error instanceof ApiError &&
          error.status === 401
        )
          this.endSession();
        throw error;
      });
      this.assertSession(session);
      this.hydrateVersion += 1;
      this.update((s) => {
        s.hydrationStatus = "idle";
      });
      await this.hydrate();
      this.assertSession(session);
      if (this.state.hydrationStatus !== "ready")
        throw new Error("记录已保存，但列表同步尚未完成，请重试。");
      return result.eventId;
    }
    const replay = source === "video";
    const sourceLabel = replay ? "视频回放验证" : "本机视觉检测";
    const existing = this.state.events.find(
      (event) =>
        event.source === sourceLabel &&
        Date.now() - Date.parse(event.createdAt) < 60_000,
    );
    if (existing) return existing.id;
    const assignee =
      this.state.members.find(
        (member) =>
          member.id === this.state.user.id ||
          member.name === this.state.user.name,
      )?.id ??
      this.state.members.find((member) => member.role === "家庭管理员")?.id ??
      this.state.user.id;
    const riskLevel = replay ? "attention" : "critical";
    const eventId = `ECV${++sequence}`;
    const taskId = `TCV${++sequence}`;
    const timestamp = new Date().toISOString();
    const description = replay
      ? "本地视频回放触发姿态规则。这是回放验证记录，请填写观察结果。视频画面未保存或上传。"
      : "本机视觉模块检测到姿态快速降低并持续低位。仅为疑似摔倒，请立即由家庭成员联系核实；未保存或上传视频画面。";
    this.update((s) => {
      s.events.unshift({
        id: eventId,
        title: replay ? "视频回放：疑似摔倒验证" : "视觉检测：疑似摔倒",
        description,
        riskLevel,
        status: "pending_confirmation",
        source: sourceLabel,
        createdAt: timestamp,
        updatedAt: timestamp,
        relatedMembers: [assignee],
        relatedDevices: [],
        relatedTasks: [taskId],
        aiAssessment: `姿态时序规则触发：躯干倾斜约 ${Math.round(torsoAngle)}°，髋部在画面中下降约 ${Math.round(hipDrop * 100)}%。需人工复核，不能据此作医疗判断。`,
        timeline: [
          {
            id: `LCV${++sequence}`,
            time: now(),
            title: "检测到疑似摔倒",
            detail: "连续姿态变化达到阈值；等待家庭成员核实。",
            actor: "本机视觉模块",
            tone: "critical",
          },
        ],
      });
      s.tasks.unshift({
        id: taskId,
        title: replay ? "记录视频回放的验证结果" : "立即联系并核实疑似摔倒",
        description: replay
          ? "填写回放观察结果，记录误报、遮挡等情况。"
          : "先联系本人，若无法确认安全，再由家庭管理员按应急预案联系现场人员。",
        assignee,
        creator: "本机视觉模块",
        sourceEventId: eventId,
        priority: replay ? "medium" : "urgent",
        status: "to_receive",
        dueAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      s.notifications.unshift({
        id: `NCV${++sequence}`,
        category: replay ? "system" : "urgent",
        title: replay ? "视频回放验证记录已创建" : "疑似摔倒，等待人工核实",
        detail: description,
        time: "刚刚",
        read: false,
        eventId,
      });
    });
    this.audit(
      "本机视觉模块",
      "device",
      eventId,
      replay ? "创建视频回放验证记录" : "创建疑似摔倒事件",
      `${source === "camera" ? "摄像头" : "本地视频"}姿态时序检测；未上传画面`,
      "success",
      riskLevel,
    );
    return eventId;
  }
  async confirmAuthorization(
    id: string,
    decision: "approve" | "reject",
  ): Promise<boolean> {
    const auth = this.state.authorizations.find((x) => x.id === id);
    if (!auth || auth.status !== "pending" || this.state.busy) return false;
    const actor = this.state.user.name;
    this.setBusy(`authorization:${id}`);
    const session = this.sessionVersion;
    try {
      await authorizationApi.decide(id, decision);
      if (session !== this.sessionVersion) return false;
      if (!apiConfig.useMock) {
        this.hydrateVersion += 1;
        this.update((state) => {
          state.hydrationStatus = "idle";
        });
        await this.hydrate();
        if (session !== this.sessionVersion) return false;
        return this.state.hydrationStatus === "ready";
      }

      this.update((s) => {
        const a = s.authorizations.find((x) => x.id === id)!;
        a.status = decision === "approve" ? "approved" : "rejected";
        if (a.eventId) {
          const e = s.events.find((x) => x.id === a.eventId)!;
          e.status = s.tasks.some(
            (task) =>
              task.sourceEventId === e.id && task.status !== "completed",
          )
            ? "processing"
            : "resolved";
          e.timeline.push({
            id: `L${++sequence}`,
            time: now(),
            title:
              decision === "approve" ? "人工确认：仅此次允许" : "操作已拦截",
            detail:
              decision === "approve"
                ? "本次确认不改变长期授权规则。"
                : "门锁未执行，未授权人员没有进入家庭。",
            actor,
            tone: decision === "approve" ? "success" : "critical",
          });
        }

        s.notifications = s.notifications.filter(
          (n) => n.eventId !== a.eventId,
        );
      });
      this.audit(
        actor,
        "user",
        `${id} ${auth.resource}`,
        decision === "approve" ? "允许本次操作" : "拒绝高风险操作",
        auth.reason,
        decision === "approve" ? "success" : "blocked",
      );
      return true;
    } catch (error) {
      if (session !== this.sessionVersion) return false;
      if (error instanceof ApiError && error.status === 401) {
        this.endSession();
        return false;
      }
      this.update((s) => {
        s.lastError = `授权提交失败：${error instanceof Error ? error.message : "未知错误"}。设备未执行任何动作。`;
      });
      this.audit(
        "家有备",
        "rule",
        `${id} ${auth.resource}`,
        "授权提交失败",
        "真实 API 未确认，保持设备安全状态",
        "failed",
        auth.riskLevel,
      );
      return false;
    } finally {
      if (session === this.sessionVersion) this.setBusy(null);
    }
  }
  private async persistTask(
    id: string,
    patch: Partial<Task>,
    label: string,
  ): Promise<boolean> {
    const current = this.state.tasks.find((task) => task.id === id);
    if (!current || current.status === "completed" || this.state.busy)
      return false;
    const actor = this.state.user.name;
    this.setBusy("task:" + id);
    const session = this.sessionVersion;
    this.clearError();
    try {
      const saved = await taskApi.update(id, {
        ...patch,
        version: patch.version ?? current.version ?? 0,
      });
      if (session !== this.sessionVersion) return false;
      if (!apiConfig.useMock) {
        this.hydrateVersion += 1;
        this.update((s) => {
          s.hydrationStatus = "idle";
        });
        await this.hydrate();
        if (session !== this.sessionVersion) return false;
        return this.state.hydrationStatus === "ready";
      }
      this.update((s) => {
        const task = s.tasks.find((item) => item.id === id);
        if (!task) return;
        Object.assign(task, patch, { id });
        task.version = (task.version ?? 0) + 1;
        if (patch.helpRequested === true && !current.helpRequested) {
          s.notifications.unshift({
            id: "N_HELP" + ++sequence,
            category: "action",
            title: `${actor}请求协助：${task.title}`,
            detail:
              "家人主动请求协助，请打开任务核对情况。接手后会更新负责人。",
            time: new Date().toISOString(),
            read: false,
            taskId: id,
            eventId: task.sourceEventId || undefined,
          });
        } else if (patch.helpRequested === false) {
          s.notifications.forEach((notice) => {
            if (notice.taskId === id) notice.read = true;
          });
        }
        if (patch.status === "completed") {
          const event = s.events.find((item) => item.id === task.sourceEventId);
          if (event) {
            event.timeline.push({
              id: "L" + ++sequence,
              time: now(),
              title: "任务完成已回传",
              detail: task.title + "已由" + actor + "核对处理记录并确认完成。",
              actor,
              tone: "success",
            });
            event.updatedAt = new Date().toISOString();
            const allComplete = s.tasks
              .filter((item) => item.sourceEventId === event.id)
              .every((item) => item.status === "completed");
            const pendingAuthorization = s.authorizations.some(
              (item) => item.eventId === event.id && item.status === "pending",
            );
            if (
              allComplete &&
              !pendingAuthorization &&
              event.status !== "closed"
            ) {
              event.status = "resolved";
              s.notifications.forEach((notice) => {
                if (notice.eventId === event.id) notice.read = true;
              });
            }
          }
        }
      });
      this.audit(
        actor,
        "user",
        id,
        label,
        "家庭成员主动操作，结果已保存",
        "success",
        current.priority === "urgent" ? "critical" : "attention",
      );
      return Boolean(saved);
    } catch (error) {
      if (session !== this.sessionVersion) return false;
      if (error instanceof ApiError && error.status === 401) {
        this.endSession();
        return false;
      }
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        !apiConfig.useMock
      ) {
        try {
          const latest = await apiRequest<Task>(`/api/tasks/${id}`);
          if (session !== this.sessionVersion) return false;
          this.update((state) => {
            const index = state.tasks.findIndex((task) => task.id === id);
            if (index >= 0) state.tasks[index] = latest;
          });
        } catch {
          /* Preserve the draft if the refresh fails. */
        }
      }
      if (session !== this.sessionVersion) return false;
      this.update((s) => {
        s.lastError =
          label +
          "未保存：" +
          (error instanceof Error ? error.message : "请重试") +
          "。";
      });
      return false;
    } finally {
      if (session === this.sessionVersion) this.setBusy(null);
    }
  }
  async saveTaskEvidence(
    id: string,
    evidence: string,
    version?: number,
  ): Promise<boolean> {
    const value = evidence.trim();
    if (!value || value.length > 4000) return false;
    return this.persistTask(
      id,
      {
        evidence: value,
        evidenceUploadedAt: new Date().toISOString(),
        status: "waiting_confirmation",
        ...(version === undefined ? {} : { version }),
      },
      "保存任务处理记录",
    );
  }
  async updateTask(
    id: string,
    action: "accept" | "complete" | "help",
  ): Promise<boolean> {
    const current = this.state.tasks.find((task) => task.id === id);
    if (!current) return false;
    const me = currentMember(
      this.state.members,
      this.state.user,
      this.state.demoMode,
    );
    if (action === "accept" && !me) {
      this.update((s) => {
        s.lastError = "无法确定你的成员资料，请刷新家庭记录后重试。";
      });
      return false;
    }
    if (action === "complete" && !canCompleteTask(current)) {
      this.audit(
        "安全规则",
        "rule",
        id,
        "拦截无证据完成任务",
        "任务必须先保存处理记录，再由家庭成员确认",
        "blocked",
        current.priority === "urgent" ? "critical" : "attention",
      );
      return false;
    }
    const patch: Partial<Task> =
      action === "complete"
        ? {
            status: "completed",
            familyConfirmedAt: new Date().toISOString(),
            helpRequested: false,
          }
        : action === "accept"
          ? {
              status: "in_progress",
              assignee: me!.id,
              helpRequested:
                me!.id === current.assignee ? current.helpRequested : false,
            }
          : { helpRequested: true };
    return this.persistTask(
      id,
      patch,
      action === "complete"
        ? "确认任务完成"
        : action === "accept"
          ? "接受家庭任务"
          : "请求家庭成员帮助",
    );
  }
  async transferTask(id: string, assignee: string): Promise<boolean> {
    if (!this.state.members.some((member) => member.id === assignee))
      return false;
    return this.persistTask(
      id,
      { assignee, status: "to_receive", helpRequested: false },
      "转交家庭任务",
    );
  }
  advanceEvent(id: string) {
    if (!apiConfig.useMock || id !== "E001") return;
    const actor = this.state.user.name;
    this.update((s) => {
      const e = s.events.find((x) => x.id === id);
      if (!e || e.status === "resolved" || e.status === "closed") return;
      const steps = [
        {
          title: "安全确认消息已发送",
          detail: "已进入家庭成员确认通道。",
          tone: "info" as const,
        },
        {
          title: "超时规则触发升级",
          detail: "10 分钟无响应，已提醒管理员电话联系。",
          tone: "warning" as const,
        },
        {
          title: "邻居完成上门确认",
          detail: "王阿姨反馈林阿姨在午睡，状态正常。",
          tone: "success" as const,
        },
        {
          title: "事件已解决",
          detail: "已通知家庭成员并保留完整审计记录。",
          tone: "success" as const,
        },
      ];
      const completed = e.timeline.filter((entry) =>
        steps.some((step) => step.title === entry.title),
      ).length;
      const index = Math.min(steps.length - 1, completed);
      const step = steps[index];
      e.timeline.push({
        id: `L${++sequence}`,
        time: now(),
        title: step.title,
        detail: step.detail,
        actor,
        tone: step.tone,
      });
      e.status = index >= 3 ? "resolved" : "processing";
      e.updatedAt = new Date().toISOString();
      if (index >= 3) {
        s.notifications = s.notifications.filter((n) => n.eventId !== id);
        s.tasks
          .filter((task) => task.sourceEventId === id)
          .forEach((task) => {
            task.status = "completed";
            task.evidence =
              task.evidence ?? "邻居已完成上门安全确认，家庭成员确认状态正常。";
            task.familyConfirmedAt = new Date().toISOString();
          });
      }
    });
    this.audit(actor, "user", id, "推进事件处理步骤", "Demo 场景人工确认");
    const event = this.state.events.find((x) => x.id === id);
    if (event)
      this.sync(
        eventApi.update(id, {
          status: event.status,
          updatedAt: event.updatedAt,
          timeline: event.timeline,
        }),
        "事件状态",
      );
  }
  async setAuthorizationPolicy(
    id: string,
    policy: Authorization["policy"],
  ): Promise<boolean> {
    const auth = this.state.authorizations.find((item) => item.id === id);
    if (
      !auth ||
      auth.status !== "active" ||
      this.state.busy ||
      !isAuthorizationPolicyAllowed(auth, policy)
    )
      return false;
    this.setBusy(`policy:${id}`);
    const session = this.sessionVersion;
    try {
      await authorizationApi.updatePolicy(id, policy);
      if (session !== this.sessionVersion) return false;
      if (!apiConfig.useMock) {
        this.hydrateVersion += 1;
        this.update((state) => {
          state.hydrationStatus = "idle";
        });
        await this.hydrate();
        if (session !== this.sessionVersion) return false;
        return this.state.hydrationStatus === "ready";
      }
      this.update((state) => {
        const record = state.authorizations.find((item) => item.id === id);
        if (record) record.policy = policy;
      });
      this.audit(
        this.state.user.name,
        "user",
        id,
        "修改授权规则",
        "家庭管理员调整长期授权边界",
        "success",
        auth.riskLevel,
      );
      return true;
    } catch (error) {
      if (session !== this.sessionVersion) return false;
      if (error instanceof ApiError && error.status === 401) {
        this.endSession();
        return false;
      }
      this.update((state) => {
        state.lastError =
          error instanceof Error ? error.message : "授权规则保存失败";
      });
      return false;
    } finally {
      if (session === this.sessionVersion) this.setBusy(null);
    }
  }
  private async resourceWrite(
    path: string,
    body: Record<string, unknown>,
    method: "POST" | "PATCH",
    apply: (state: ProductState, id: string) => void,
  ) {
    if (this.state.busy) throw new Error("正在保存，请稍后再试");
    if (!["家庭管理员", "admin"].includes(this.state.user.role))
      throw new Error("此操作需要家庭管理员权限");
    this.setBusy("resource");
    const session = this.sessionVersion;
    try {
      if (apiConfig.useMock) {
        await mockDelay(120);
        this.assertSession(session);
        const id = `LOCAL_${++sequence}`;
        this.update((state) => apply(state, id));
        return id;
      }
      const result = await apiRequest<{ id?: string }>(path, {
        method,
        body: JSON.stringify(body),
      });
      this.assertSession(session);
      this.hydrateVersion += 1;
      this.update((state) => {
        state.hydrationStatus = "idle";
      });
      await this.hydrate();
      this.assertSession(session);
      if (this.state.hydrationStatus !== "ready")
        throw new Error("记录已保存，页面刷新失败，请重新加载家庭记录");
      return result.id ?? "";
    } catch (error) {
      this.assertSession(session);
      if (error instanceof ApiError && error.status === 401) this.endSession();
      throw error;
    } finally {
      if (session === this.sessionVersion) this.setBusy(null);
    }
  }
  async addMember(input: Record<string, unknown>) {
    const values = memberInput(input);
    const id = await this.resourceWrite(
      "/api/members",
      values,
      "POST",
      (state, id) => {
        state.members.push({
          id,
          ...values,
          avatar: values.name.slice(0, 1),
          online: false,
          location: "未共享",
          permissions: [],
          emergencyContact: false,
        } satisfies FamilyMember);
      },
    );
    if (apiConfig.useMock)
      this.audit(this.state.user.name, "user", id, "添加家庭成员", values.name);
  }
  async editFamily(input: Record<string, unknown>) {
    const values = familyInput(input);
    await this.resourceWrite(
      "/api/families/current",
      values,
      "PATCH",
      (state) => {
        Object.assign(state.family, values);
      },
    );
    if (apiConfig.useMock)
      this.audit(
        this.state.user.name,
        "user",
        this.state.family.id,
        "修改家庭资料",
        "管理员修改家庭名称或地址",
      );
  }
  async addTask(input: Record<string, unknown>) {
    const values = taskCreateInput(input);
    if (!this.state.members.some((member) => member.id === values.assignee))
      throw new Error("请选择当前家庭的负责人");
    const event = this.state.events.find(
      (event) => event.id === values.sourceEventId,
    );
    if (
      values.sourceEventId &&
      (!event || ["resolved", "closed"].includes(event.status))
    )
      throw new Error("请选择正在处理的来源事件");
    const id = await this.resourceWrite(
      "/api/tasks",
      values,
      "POST",
      (state, id) => {
        state.tasks.unshift({
          id,
          ...values,
          creator: state.user.name,
          status: "to_receive",
        });
        const event = state.events.find(
          (event) => event.id === values.sourceEventId,
        );
        if (event) {
          event.relatedTasks.push(id);
          event.updatedAt = new Date().toISOString();
          event.timeline.push({
            id: `L${++sequence}`,
            time: event.updatedAt,
            title: "已安排家庭任务",
            detail: values.title,
            actor: state.user.name,
            tone: "info",
          });
        }
      },
    );
    if (apiConfig.useMock)
      this.audit(
        this.state.user.name,
        "user",
        id,
        "创建家庭任务",
        values.title,
      );
    return id;
  }
  async editMember(id: string, input: Record<string, unknown>) {
    const values = memberInput(input);
    await this.resourceWrite(`/api/members/${id}`, values, "PATCH", (state) => {
      const member = state.members.find((item) => item.id === id);
      if (member)
        Object.assign(member, values, { avatar: values.name.slice(0, 1) });
    });
    if (apiConfig.useMock)
      this.audit(this.state.user.name, "user", id, "编辑成员资料", values.name);
  }
  async addDevice(input: Record<string, unknown>) {
    const values = deviceInput(input);
    const id = await this.resourceWrite(
      "/api/devices",
      values,
      "POST",
      (state, id) => {
        state.devices.push({
          id,
          ...values,
          state: "normal",
          reading: "正常（模拟状态）",
          online: true,
          riskLevel: "normal",
          lastSync: new Date().toISOString(),
          source: "simulator",
          permission: "仅读取模拟状态",
          relatedEventIds: [],
        } satisfies Device);
      },
    );
    if (apiConfig.useMock)
      this.audit(this.state.user.name, "user", id, "添加模拟设备", values.name);
  }
  async addService(input: Record<string, unknown>) {
    const values = serviceInput(input);
    const id = await this.resourceWrite(
      "/api/services",
      values,
      "POST",
      (state, id) => {
        state.services.push({
          id,
          ...values,
          verified: false,
          trustLevel: "unverified",
          lastUsed: "从未使用",
        } satisfies ServiceProvider);
      },
    );
    if (apiConfig.useMock)
      this.audit(this.state.user.name, "user", id, "添加服务资源", values.name);
  }
  async verifyService(id: string, note: string) {
    if (note.trim().length < 8 || note.length > 1000)
      throw new Error("请填写核实方式与结果（至少 8 个字）");
    await this.resourceWrite(
      `/api/services/${id}`,
      { verified: true, note: note.trim() },
      "PATCH",
      (state) => {
        const service = state.services.find((item) => item.id === id);
        if (service) {
          service.verified = true;
          service.trustLevel = "medium";
          service.note = note.trim();
        }
      },
    );
    if (apiConfig.useMock)
      this.audit(
        this.state.user.name,
        "user",
        id,
        "核实服务联系方式",
        note.trim(),
      );
  }
  async sendMessage(text: string): Promise<void> {
    const value = text.trim();
    if (!value || this.state.busy) return;
    const session = this.sessionVersion;
    this.setBusy("agent");
    this.update((s) => {
      s.aiMessages.push({
        id: `AI${++sequence}`,
        role: "user",
        text: value,
        createdAt: now(),
      });
      s.busy = "agent";
    });
    try {
      const result = await agentApi.analyze(value);
      if (session !== this.sessionVersion) return;
      if (apiConfig.useMock && result.cardType) {
        const eventId = `E_LOCAL_${++sequence}`;
        const taskId = `T_LOCAL_${++sequence}`;
        const authId =
          result.cardType === "authorization"
            ? `A_LOCAL_${++sequence}`
            : undefined;
        const timestamp = new Date().toISOString();
        const riskLevel = result.riskLevel ?? "attention";
        this.update((state) => {
          const owner =
            state.members.find(
              (member) =>
                member.id === state.user.id || member.name === state.user.name,
            ) ??
            state.members.find((member) => member.role === "家庭管理员") ??
            state.members[0];
          const title = authId
            ? "核实访客与开门请求"
            : `核实家庭情况：${value.slice(0, 30)}`;
          state.events.unshift({
            id: eventId,
            title,
            description: value,
            riskLevel,
            status: authId ? "pending_confirmation" : "processing",
            source: "演示规则分析",
            createdAt: timestamp,
            updatedAt: timestamp,
            relatedMembers: owner ? [owner.id] : [],
            relatedDevices: [],
            relatedTasks: [taskId],
            relatedAuthorizationId: authId,
            aiAssessment: "演示输入需要家庭成员人工核实，尚未验证描述真实性。",
            timeline: [
              {
                id: `L_LOCAL_${++sequence}`,
                time: timestamp,
                title: "情况描述已记录",
                detail: value,
                actor: state.user.name,
                tone: "info",
              },
            ],
          });
          state.tasks.unshift({
            id: taskId,
            title,
            description: "联系相关人员核实描述，保存处理记录，再确认完成。",
            assignee: owner?.id ?? "",
            creator: "演示规则分析",
            sourceEventId: eventId,
            priority: riskLevel === "critical" ? "urgent" : "medium",
            status: "to_receive",
            dueAt: new Date(Date.now() + 10 * 60000).toISOString(),
          });
          if (authId)
            state.authorizations.unshift({
              id: authId,
              action: "确认本次开门请求",
              resource:
                state.devices.find((device) => device.kind === "lock")?.name ??
                "入户门锁",
              riskLevel: "critical",
              policy: "ask_every_time",
              requester: "演示分析",
              reason: value,
              createdAt: timestamp,
              status: "pending",
              eventId,
              consequence: "仅保存人工决定，本演示不执行门锁动作",
            });
          state.notifications.unshift({
            id: `N_LOCAL_${++sequence}`,
            category: riskLevel === "critical" ? "urgent" : "action",
            title,
            detail: "演示事件已记录，等待人工核实。",
            time: timestamp,
            read: false,
            eventId,
          });
        });
        result.eventId = eventId;
        result.taskIds = [taskId];
        result.relatedId = authId ?? taskId;
        this.audit(
          this.state.user.name,
          "user",
          eventId,
          "记录演示情况与核实任务",
          value,
        );
      }
      this.update((s) => {
        s.aiMessages.push({
          id: `AI${++sequence}`,
          role: "assistant",
          text: result.text,
          createdAt: now(),
          cardType: result.cardType,
          relatedId: result.relatedId,
          analysisMode: result.analysisMode,
        });
        s.busy = null;
        s.lastError = null;
      });
      if (result.eventId || (result.taskIds && result.taskIds.length > 0))
        void this.retryHydrate();
    } catch (error) {
      if (session !== this.sessionVersion) return;
      if (error instanceof ApiError && error.status === 401) {
        this.endSession();
        return;
      }
      this.update((s) => {
        s.busy = null;
        s.lastError = `AI 分析未完成：${error instanceof Error ? error.message : "未知错误"}。请先更新记录，核对本次提交是否已有相关事件和任务。`;
        s.aiMessages.push({
          id: `AI${++sequence}`,
          role: "assistant",
          text: "暂时无法确认本次提交是否完成。已有家庭记录仍保留，请先核对最新事件和任务，再决定是否重新提交情况描述。重要操作仍需要家人确认。",
          createdAt: now(),
          cardType: "risk",
        });
      });
    }
  }
  resetConversation() {
    if (this.state.busy) return;
    this.update((s) => {
      s.aiMessages = clone(initialMessages);
      s.lastError = null;
      s.busy = null;
    });
  }
  reset() {
    this.hydrateVersion += 1;
    this.sessionVersion += 1;
    this.recordsRefresh = null;
    this.state = createInitialState();
    this.listeners.forEach((listener) => listener());
    if (!apiConfig.useMock) void this.hydrate();
  }
}

export const productStore = new ProductStore();
export const useProductStore = () =>
  useSyncExternalStore(
    productStore.subscribe,
    productStore.getSnapshot,
    productStore.getSnapshot,
  );
export type Store = ProductStore;
