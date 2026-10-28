export type EvidenceCategory = "synthetic" | "bench" | "reenactment" | "field";
export type EvidenceKind = "activity" | "door" | "availability" | "reply" | "help" | "image";
export type CareEvidence = {
  id: string; sourceId: string; kind: EvidenceKind; value: string;
  observedAt: number; receivedAt: number; expiresAt: number;
  authorized: boolean; quality: "valid" | "unknown" | "invalid";
  provenance: "observation" | "confirmation" | "inference";
  category: EvidenceCategory; transport: "live" | "replay";
  datasetId: string; sampleId: string; subjectId?: string; caseId?: string; contextId?: string;
};
export type CareAgreement = {
  subjectId?: string;
  contact: string; nearbyContact?: string; waitMinutes: number; silenceMinutes: number;
  timezone: string; restWindows: { start: string; end: string }[];
};
export const defaultCareAgreement: CareAgreement = {
  contact: "M003", nearbyContact: "M005", waitMinutes: 10, silenceMinutes: 90,
  timezone: "Asia/Shanghai", restWindows: [],
};
export type EvidenceAssessment = {
  disposition: "priority_response" | "verify" | "rest" | "monitoring";
  title: string; reason: string; used: CareEvidence[];
  excluded: { id: string; reason: string }[]; missing: string[];
};
export function validateEvidence(input: unknown): asserts input is CareEvidence {
  if (!input || typeof input !== "object") throw new Error("缺少证据内容");
  const e = input as CareEvidence;
  for (const key of ["id", "sourceId", "value", "datasetId", "sampleId"] as const)
    if (typeof e[key] !== "string" || !e[key].trim() || e[key].length > 240) throw new Error(`无效证据字段：${key}`);
  if (!["activity", "door", "availability", "reply", "help", "image"].includes(e.kind) ||
      !["valid", "unknown", "invalid"].includes(e.quality) ||
      !["observation", "confirmation", "inference"].includes(e.provenance) ||
      !["synthetic", "bench", "reenactment", "field"].includes(e.category) ||
      !["live", "replay"].includes(e.transport) || typeof e.authorized !== "boolean") throw new Error("无效证据类别");
  if (![e.observedAt, e.receivedAt, e.expiresAt].every(Number.isFinite) || e.expiresAt <= e.observedAt || e.expiresAt - e.observedAt > 7 * 86400000) throw new Error("无效证据时间");
  for (const key of ["subjectId", "caseId"] as const)
    if (e[key] !== undefined && (typeof e[key] !== "string" || e[key]!.length > 100)) throw new Error("无效事件关联");
}
export function validateAgreement(a: CareAgreement) {
  if (!a || typeof a.contact !== "string" || !a.contact || ![5, 10, 15].includes(a.waitMinutes) || !Number.isFinite(a.silenceMinutes) || a.silenceMinutes < 15 || a.silenceMinutes > 720 || !Array.isArray(a.restWindows) || a.restWindows.length > 4) throw new Error("请检查家庭联系约定");
  new Intl.DateTimeFormat("zh-CN", { timeZone: a.timezone }).format();
  if (a.restWindows.some(w => !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end) || w.start === w.end)) throw new Error("请检查午休时段");
}
export function assessCareEvidence(records: CareEvidence[], agreement: CareAgreement, now: number, caseId?: string, subjectId?: string): EvidenceAssessment {
  validateAgreement(agreement);
  const excluded: EvidenceAssessment["excluded"] = [], candidates: CareEvidence[] = [];
  const seen = new Set<string>();
  for (const e of records) {
    validateEvidence(e);
    const identity = `${e.datasetId}/${e.sourceId}/${e.id}`;
    const reason = seen.has(identity) ? "重复事件" : !e.authorized ? "未获授权" : e.quality !== "valid" ? "来源质量待核实" : e.observedAt > now + 60000 || e.receivedAt > now + 60000 ? "时间超前" : e.expiresAt <= now ? "已过有效期" : e.caseId && e.caseId !== caseId ? "不属于当前事件" : e.subjectId && subjectId && e.subjectId !== subjectId ? "不属于当前被关怀者" : "";
    seen.add(identity);
    if (reason) excluded.push({ id: e.id, reason }); else candidates.push(e);
  }
  // A newer observation supersedes older state from the same source and kind.
  const latest = new Map<string, CareEvidence>();
  for (const e of candidates) {
    const eventKey=e.kind==="activity"&&e.value==="active"?"/last-active":e.kind==="help"&&e.value==="requested"?"/help-request":e.kind==="reply"&&e.value==="responded_unknown_identity"?"/response-press":"";
    const key = `${e.sourceId}/${e.kind}${eventKey}`, prior = latest.get(key);
    if (!prior || e.observedAt > prior.observedAt || e.observedAt === prior.observedAt && e.receivedAt > prior.receivedAt) latest.set(key, e);
  }
  const used = [...latest.values()], missing: string[] = [];
  for (const e of candidates) if (!used.includes(e)) excluded.push({ id: e.id, reason: "同来源已有更新记录" });
  const trusted = (e: CareEvidence) => e.provenance !== "inference";
  const help = used.some(e => e.kind === "help" && e.value === "requested" && trusted(e));
  const scopedConfirmation = (e: CareEvidence) => Boolean(caseId && e.caseId === caseId && e.provenance === "confirmation");
  const safe = used.some(e => e.kind === "reply" && e.value === "safe_confirmed" && scopedConfirmation(e));
  const away = used.some(e => e.kind === "reply" && e.value === "away_confirmed" && scopedConfirmation(e));
  const activity = used.filter(e => e.kind === "activity" && trusted(e));
  const recentActivity = activity.some(e => e.value === "active" && now - e.observedAt < agreement.silenceMinutes * 60000);
  const lastActivity = activity.filter(e => e.value === "active").sort((a, b) => b.observedAt - a.observedAt)[0];
  const availability = used.find(e => e.kind === "availability" && e.sourceId === lastActivity?.sourceId && trusted(e));
  const online = availability?.value === "online";
  const offline = availability?.value === "offline";
  const silence = online && !offline && Boolean(lastActivity && now - lastActivity.observedAt >= agreement.silenceMinutes * 60000);
  const unanswered = used.some(e => e.kind === "reply" && e.value === "no_answer" && trusted(e));
  if (!online || offline) missing.push("活动设备的持续在线记录");
  if (!lastActivity) missing.push("可追溯的上次活动记录");
  if (used.some(e => e.kind === "door")) missing.push("门磁只能说明门的变化，是否外出仍需本人或家属确认");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: agreement.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const resting = agreement.restWindows.some(w => w.start < w.end ? time >= w.start && time < w.end : time >= w.start || time < w.end);
  const result = (disposition: EvidenceAssessment["disposition"], title: string, reason: string) => ({ disposition, title, reason, used, excluded, missing });
  if (help) return result("priority_response", "收到明确求助，请家人优先响应", "新鲜的明确求助优先处理，其他设备离线或午休约定不阻断人工响应。");
  if (safe) return result("monitoring", "妈妈已经回应平安", "当前事件已有明确核实记录，可结束后续未发出的联系。");
  if (away) return result("monitoring", "家人已确认外出", "依据当前事件的人工作答，继续关注，暂不安排上门。");
  if (used.some(e=>e.kind==="reply"&&e.value==="responded_unknown_identity"&&trusted(e))) return result("verify","收到按钮回应，请核实身份","有人按下了回应按钮，仍需家人核实身份和本次情况。");
  if (recentActivity && !unanswered) return result("monitoring", "家中有新的活动线索", "活动仅说明区域内有动态，当前无需追加联系安排。");
  if (resting && online && !offline && !unanswered) return result("rest", "在约定的午休时间，先轻声关注", "家庭午休约定正在生效，设备在线；约定结束后重新核实。");
  if (silence || unanswered || offline || !online) return result("verify", offline || !online ? "先确认家中的连接" : "妈妈还没有回应", offline || !online ? "部分设备情况未知，先检查连接，并请家人轻量核实。" : "静默时长与回应记录需要进一步核实，先整理可确认的联系安排。");
  return result("monitoring", "家中情况，持续关注", "目前没有足够依据追加联系，保留未知并等待新线索。");
}
