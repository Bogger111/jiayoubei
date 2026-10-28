export type CareSignals = {
  observedAt: number;
  activityMinutes: number;
  door: "home" | "away" | "unknown";
  voice: "unanswered" | "safe" | "help" | "unknown";
  online: boolean;
  imageAuthorized: boolean;
  image: "empty" | "person" | "unknown";
};
export type CareStep = {
  id: "device" | "family" | "nearby";
  title: string;
  status: "pending" | "done" | "failed" | "skipped";
  detail?: string;
  at?: number;
};
export type CarePlan = {
  id: string;
  revision: number;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "monitoring" | "following" | "resolved";
  title: string;
  reason: string;
  evidence: { label: string; value: string }[];
  steps: CareStep[];
  contact: string;
  waitMinutes: number;
  approvedBy?: string;
  approvedAt?: number;
  nextCheckAt?: number;
  reply?: string;
  resolvedAt?: number;
  signals: CareSignals;
};
export type CareScenario = "unanswered" | "away" | "safe" | "offline" | "authorized";
export const careScenarioLabels: Record<CareScenario, string> = {
  unanswered: "妈妈暂未回应", away: "妈妈已外出", safe: "语音报平安", offline: "传感器离线", authorized: "加入授权图像场景",
};
export function demoCareSignals(scenario: CareScenario = "unanswered", now = Date.now()): CareSignals {
  return { observedAt: now, activityMinutes: 120, door: scenario === "away" ? "away" : "home", voice: scenario === "safe" ? "safe" : "unanswered", online: scenario !== "offline", imageAuthorized: scenario === "authorized", image: "empty" };
}
export function createCarePlan(signals: CareSignals, now = Date.now()): CarePlan {
  const stale = !Number.isFinite(signals.observedAt) || signals.observedAt > now + 60_000 || now - signals.observedAt > 30 * 60_000;
  const unavailable = !signals.online || stale || !Number.isFinite(signals.activityMinutes) || signals.activityMinutes < 0;
  const evidence = [
    { label: "活动感应", value: unavailable ? "等待设备更新" : `近 ${Math.round(signals.activityMinutes / 60 * 10) / 10} 小时较少` },
    { label: "门磁记录", value: unavailable ? "记录待更新" : signals.door === "away" ? "有离家记录" : signals.door === "home" ? "未见离家" : "暂无记录" },
    { label: "语音询问", value: stale ? "回应记录待更新" : signals.voice === "safe" ? "已回应平安" : signals.voice === "help" ? "收到求助" : signals.voice === "unanswered" ? "暂未回应" : "尚未询问" },
  ];
  if (signals.imageAuthorized && !unavailable) evidence.push({ label: "授权画面", value: signals.image === "empty" ? "客厅暂未见人" : signals.image === "person" ? "客厅有人，状态待确认" : "画面待核实" });
  const safe = !stale && signals.voice === "safe";
  const away = !unavailable && signals.door === "away" && signals.voice !== "help";
  const concern = !safe && !away && (unavailable || signals.voice === "help" || (signals.activityMinutes >= 90 && signals.voice === "unanswered"));
  return {
    id: `CARE-${now}`, revision: 1, createdAt: now, expiresAt: now + 20 * 60_000,
    status: concern ? "pending" : "monitoring",
    title: safe ? "妈妈已经回应平安" : away ? "妈妈可能正在外出" : unavailable ? "先确认家中的连接" : concern ? "妈妈还没有回应" : "家中情况，持续关注",
    reason: safe ? "收到明确回应，这次无需继续联系其他家人。" : away ? "门磁显示有离家记录。继续关注，暂不安排上门。" : unavailable ? "设备信息不完整，先检查连接，同时请家人确认情况。" : concern ? "结合家中动态，我整理了一份确认计划。" : "目前的信息不足以安排进一步行动。",
    evidence, contact: "M003", waitMinutes: 10, signals: { ...signals },
    steps: concern ? [
      { id: "device", title: unavailable ? "检查设备连接，尝试语音联系" : "联动灯光与音箱，再次语音询问", status: "pending" },
      { id: "family", title: "请家人协助联系妈妈", status: "pending" },
      { id: "nearby", title: "仍无回应时，请附近联系人核实", status: "pending" },
    ] : [],
  };
}
export function reviseCarePlan(plan: CarePlan, contact: string, waitMinutes: number): CarePlan {
  if (plan.status !== "pending") throw new Error("计划开始后不能修改，请先处理当前跟进。");
  if (!contact || ![5, 10, 15].includes(waitMinutes)) throw new Error("请选择联系人与等待时间。");
  return { ...plan, revision: plan.revision + 1, contact, waitMinutes };
}
export function approveCarePlan(plan: CarePlan, actor: string, now = Date.now()): CarePlan {
  if (plan.status !== "pending" || plan.approvedAt) throw new Error("这份计划已处理，请勿重复执行。");
  if (!actor.trim()) throw new Error("请先确认家庭成员身份。");
  if (now > plan.expiresAt || now < plan.createdAt) throw new Error("情况可能已变化，请重新整理计划。");
  return { ...plan, status: "following", approvedBy: actor, approvedAt: now, nextCheckAt: now + plan.waitMinutes * 60_000, steps: plan.steps.map(step => ({ ...step })) };
}
export function recordCareStep(plan: CarePlan, id: CareStep["id"], success: boolean, detail: string, now = Date.now()): CarePlan {
  if (!plan.approvedBy || plan.approvedAt === undefined || plan.status !== "following") throw new Error("需要家人确认这份计划。");
  const index = plan.steps.findIndex(step => step.id === id);
  if (index < 0 || plan.steps[index].status !== "pending") throw new Error("该步骤已处理或不存在。");
  if (plan.steps.slice(0, index).some(step => step.status === "pending")) throw new Error("请先完成前面的步骤。");
  if (id === "nearby" && now < (plan.nextCheckAt ?? Infinity)) throw new Error("等待时间尚未到达。");
  if (!detail.trim() || now < plan.approvedAt) throw new Error("请提供有效的执行回执。");
  return { ...plan, steps: plan.steps.map(step => step.id === id ? { ...step, status: success ? "done" : "failed", detail, at: now } : { ...step }) };
}
export function resolveCarePlan(plan: CarePlan, reply: string, now = Date.now()): CarePlan {
  if (plan.status !== "following" || !plan.approvedBy) throw new Error("当前没有正在跟进的计划。");
  if (reply.trim().length < 4 || reply.length > 1000) throw new Error("请记录家人的回应，至少 4 个字。");
  return { ...plan, status: "resolved", title: "这次牵挂，有了回应", reply: reply.trim(), resolvedAt: now, steps: plan.steps.map(step => step.status === "pending" ? { ...step, status: "skipped", detail: "已收到家人回应，无需继续", at: now } : { ...step }) };
}
