import { assessCareEvidence, defaultCareAgreement, type CareAgreement, type CareEvidence, type EvidenceAssessment } from "./care-evidence.ts";
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
  status: "pending" | "queued" | "accepted" | "done" | "failed" | "unknown" | "skipped";
  detail?: string;
  at?: number;
  deliveredAt?: number;
  acceptedBy?: string;
};
export type CarePlan = {
  id: string;
  revision: number;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "monitoring" | "following" | "resolved" | "cancelled";
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
  records: CareEvidence[];
  assessment: EvidenceAssessment;
  agreement: CareAgreement;
  priority: "normal" | "urgent";
  subjectName?: string;
  approvedRevision?: number;
  outcome?: CareOutcome;
  history: { at: number; actor: string; title: string; detail: string }[];
};
export const careOutcomeLabels = { safe_confirmed: "已明确核实平安", no_answer: "还没有联系到", needs_followup: "仍需继续确认", help_requested: "收到明确求助", cancelled_unresolved: "取消跟进，情况未核实" } as const;
export type CareOutcomeInput = { type: keyof typeof careOutcomeLabels; remark: string; method: "phone" | "in_person" | "message" | "button"; actor: string; caseId: string; confirmed: boolean };
export type CareOutcome = CareOutcomeInput & { at: number };
export type CareScenario = "unanswered" | "away" | "safe" | "offline" | "authorized";
export const careScenarioLabels: Record<CareScenario, string> = {
  unanswered: "妈妈暂未回应", away: "妈妈已外出", safe: "语音报平安", offline: "传感器离线", authorized: "加入授权图像场景",
};
export function demoCareSignals(scenario: CareScenario = "unanswered", now = Date.now()): CareSignals {
  return { observedAt: now, activityMinutes: 120, door: scenario === "away" ? "away" : "home", voice: scenario === "safe" ? "safe" : "unanswered", online: scenario !== "offline", imageAuthorized: scenario === "authorized", image: "empty" };
}
export function createCarePlan(signals: CareSignals, now = Date.now()): CarePlan {
  const id = `CARE-${now}`;
  const records = legacyCareEvidence(signals, now, id);
  return createEvidenceCarePlan(records, defaultCareAgreement, now, id);
}
export function legacyCareEvidence(signals: CareSignals, now: number, caseId: string): CareEvidence[] {
  const base = { receivedAt: now, expiresAt: signals.observedAt + 30 * 60000, authorized: true, quality: "valid" as const, provenance: "observation" as const, category: "synthetic" as const, transport: "replay" as const, datasetId: "care-demo-v2", sampleId: caseId, caseId };
  const valid = Number.isFinite(signals.activityMinutes) && signals.activityMinutes >= 0 && Number.isFinite(signals.observedAt);
  const observedAt = Number.isFinite(signals.observedAt) ? signals.observedAt : now - 86400000;
  return [
    { ...base, id: `${caseId}-activity`, sourceId: "demo-motion", kind: "activity", value: "active", observedAt: observedAt - (valid ? signals.activityMinutes : 0) * 60000, expiresAt: observedAt + 86400000, quality: valid ? "valid" : "invalid" },
    { ...base, id: `${caseId}-online`, sourceId: "demo-motion", kind: "availability", value: signals.online ? "online" : "offline", observedAt, expiresAt: observedAt + 30 * 60000 },
    { ...base, id: `${caseId}-door`, sourceId: "demo-door", kind: "door", value: signals.door === "away" ? "open" : "closed", observedAt, expiresAt: observedAt + 30 * 60000 },
    { ...base, id: `${caseId}-voice`, sourceId: "demo-response", kind: signals.voice === "help" ? "help" : "reply", value: signals.voice === "safe" ? "safe_confirmed" : signals.voice === "help" ? "requested" : signals.door === "away" ? "away_confirmed" : signals.voice === "unanswered" ? "no_answer" : "unknown", observedAt, expiresAt: observedAt + 30 * 60000, provenance: signals.voice === "safe" || signals.door === "away" ? "confirmation" : "observation" },
    { ...base, id: `${caseId}-image`, sourceId: "demo-camera", kind: "image", value: signals.image, observedAt, expiresAt: observedAt + 30 * 60000, authorized: signals.imageAuthorized },
  ];
}
export function createEvidenceCarePlan(records: CareEvidence[], agreement: CareAgreement, now = Date.now(), id = `CARE-${now}`, subjectId?: string): CarePlan {
  const assessment = assessCareEvidence(records, agreement, now, id, subjectId);
  const concern = assessment.disposition === "verify" || assessment.disposition === "priority_response";
  const activity = assessment.used.filter(e => e.kind === "activity" && e.value === "active").sort((a,b)=>b.observedAt-a.observedAt)[0];
  const signals: CareSignals = { observedAt: now, activityMinutes: activity ? Math.max(0,(now-activity.observedAt)/60000) : 0, door: "unknown", voice: assessment.disposition === "priority_response" ? "help" : "unknown", online: assessment.used.some(e=>e.sourceId===activity?.sourceId&&e.kind==="availability"&&e.value==="online"), imageAuthorized: assessment.used.some(e=>e.kind==="image"), image: "unknown" };
  const unavailable = !signals.online;
  const image = assessment.used.find(e=>e.kind==="image");
  signals.image=image?.value==="empty"?"empty":image?.value==="person"?"person":"unknown";
  const evidence = [
    { label: "活动感应", value: unavailable ? "等待设备更新" : `近 ${Math.round(signals.activityMinutes / 60 * 10) / 10} 小时较少` },
    { label: "门磁记录", value: assessment.used.some(e=>e.kind==="door") ? "仅有门的开关记录" : "记录待更新" },
    { label: "回应记录", value: signals.voice === "help" ? "收到明确求助" : assessment.used.some(e=>e.kind==="reply"&&e.value==="responded_unknown_identity") ? "收到按钮回应，身份待核实" : assessment.used.some(e=>e.kind==="reply"&&e.value==="no_answer") ? "暂未回应" : "查看本次核实记录" },
  ];
  if (signals.imageAuthorized && !unavailable) evidence.push({ label: "授权画面", value: signals.image === "empty" ? "客厅暂未见人" : signals.image === "person" ? "客厅有人，状态待确认" : "画面待核实" });
  return {
    id, revision: 1, createdAt: now, expiresAt: now + 20 * 60_000,
    status: concern ? "pending" : "monitoring",
    title: assessment.title, reason: assessment.reason,
    evidence, contact: agreement.contact, waitMinutes: agreement.waitMinutes, signals,
    records, assessment, agreement: structuredClone(agreement), priority: assessment.disposition === "priority_response" ? "urgent" : "normal", history: [],
    steps: concern ? [
      { id: "device", title: unavailable ? "检查设备连接，发起轻量核实" : "开启关怀提示灯，请家人核实回应", status: "pending" },
      { id: "family", title: "请家人协助联系妈妈", status: "pending" },
      { id: "nearby", title: "仍无回应时，请附近联系人核实", status: "pending" },
    ] : [],
  };
}
export function reviseCarePlan(plan: CarePlan, contact: string, waitMinutes: number): CarePlan {
  if (plan.status !== "pending") throw new Error("计划开始后不能修改，请先处理当前跟进。");
  if (!contact || ![5, 10, 15].includes(waitMinutes)) throw new Error("请选择联系人与等待时间。");
  return { ...plan, revision: plan.revision + 1, contact, waitMinutes, agreement: { ...plan.agreement, contact, waitMinutes } };
}
export function approveCarePlan(plan: CarePlan, actor: string, now = Date.now()): CarePlan {
  if (plan.status !== "pending" || plan.approvedAt) throw new Error("这份计划已处理，请勿重复执行。");
  if (!actor.trim()) throw new Error("请先确认家庭成员身份。");
  if (now > plan.expiresAt || now < plan.createdAt) throw new Error("情况可能已变化，请重新整理计划。");
  return { ...plan, revision: plan.revision + 1, approvedRevision: plan.revision, status: "following", approvedBy: actor, approvedAt: now, nextCheckAt: now + plan.waitMinutes * 60_000, steps: plan.steps.map(step => ({ ...step })), history: [...plan.history, { at: now, actor, title: "家人批准计划", detail: `确认第 ${plan.revision} 版联系安排` }] };
}
export function recordCareStep(plan: CarePlan, id: CareStep["id"], success: boolean, detail: string, now = Date.now()): CarePlan {
  if (!plan.approvedBy || plan.approvedAt === undefined || plan.status !== "following") throw new Error("需要家人确认这份计划。");
  const index = plan.steps.findIndex(step => step.id === id);
  if (index < 0 || plan.steps[index].status !== "pending") throw new Error("该步骤已处理或不存在。");
  if (plan.steps.slice(0, index).some(step => step.status === "pending")) throw new Error("请先完成前面的步骤。");
  if (id === "nearby" && now < (plan.nextCheckAt ?? Infinity)) throw new Error("等待时间尚未到达。");
  if (!detail.trim() || now < plan.approvedAt) throw new Error("请提供有效的执行回执。");
  return { ...plan, revision: plan.revision + 1, steps: plan.steps.map(step => step.id === id ? { ...step, status: success ? id === "device" ? "done" : "queued" : "failed", detail, at: now } : { ...step }), history: [...plan.history, { at: now, actor: "执行适配器", title: id === "device" ? "收到设备步骤回执" : "已创建联系任务", detail }] };
}
export function claimCareStep(plan: CarePlan, actor: string, now = Date.now(), id: "family"|"nearby" = "family"): CarePlan {
  if (plan.status !== "following" || !actor.trim()) throw new Error("当前任务不能接手");
  const step = plan.steps.find(s=>s.id === id);
  if (step?.status !== "queued") throw new Error("任务尚未发出或已经有人接手");
  return { ...plan, revision: plan.revision+1, steps: plan.steps.map(s=>s.id===id?{ ...s, status:"accepted", deliveredAt:s.deliveredAt??now,acceptedBy:actor,detail:`${actor}已接手，等待联系结果`,at:now }:s), history:[...plan.history,{at:now,actor,title:"家人已接手",detail:"接手任务，尚未核实结果"}] };
}
export function resolveCarePlan(plan: CarePlan, input: CareOutcomeInput | string, now = Date.now()): CarePlan {
  if (plan.status !== "following" || !plan.approvedBy) throw new Error("当前没有正在跟进的计划。");
  if (typeof input === "string" || !input || !Object.hasOwn(careOutcomeLabels,input.type)) throw new Error("请选择明确的联系结果，备注不能直接结束跟进。");
  if (!input.actor?.trim() || input.caseId!==plan.id || !["phone","in_person","message","button"].includes(input.method) || typeof input.remark!=="string" || input.remark.length>1000 || now < plan.approvedAt!) throw new Error("请核对确认人、方式、时间和当前事件。");
  if (input.type==="safe_confirmed" && (input.confirmed!==true || input.remark.trim().length<4)) throw new Error("请明确确认已核实本次情况，并记录核实经过。");
  const terminal = input.type==="safe_confirmed" || input.type==="cancelled_unresolved";
  return { ...plan, revision: plan.revision+1, status: input.type==="safe_confirmed"?"resolved":input.type==="cancelled_unresolved"?"cancelled":"following", title: input.type==="safe_confirmed"?"这次牵挂，有了回应":input.type==="cancelled_unresolved"?"跟进已取消，情况仍待核实":input.type==="help_requested"?"收到明确求助，请家人优先响应":"还需要继续确认家人情况", reply: input.remark.trim(), outcome: { ...input, remark: input.remark.trim(), at: now }, ...(input.type==="safe_confirmed"?{resolvedAt:now}:{}), ...(input.type==="help_requested"?{priority:"urgent" as const}:{}), steps:plan.steps.map(s=>input.type==="safe_confirmed"&&s.status==="accepted"&&s.acceptedBy===input.actor?{...s,status:"done",detail:`${input.actor}已明确核实本次情况`,at:now}:terminal&&(s.status==="pending"||s.status==="queued")?{...s,status:"skipped",detail:input.type==="safe_confirmed"?"已明确核实，取消尚未发出的联系":"人工取消，情况未核实",at:now}:s), history:[...plan.history,{at:now,actor:input.actor,title:careOutcomeLabels[input.type],detail:input.remark.trim()||careOutcomeLabels[input.type]}] };
}
