import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { analyzeFamilyEvent } from "@/lib/agent-engine";
import type { TimelineEntry } from "@/lib/product-models";

export type HaWebhookPayload = {
  entity_id?: unknown;
  state?: unknown;
  friendly_name?: unknown;
  family_member?: unknown;
  message?: unknown;
};

const randomId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const nowTime = () => new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
const nowIso = () => new Date().toISOString();

function isDisconnected(state: string): boolean {
  const value = state.toLowerCase();
  return value === "unknown" || value === "unavailable" || value === "off" || value === "disconnected" || value === "" || value === "not_home";
}

function isCharging(state: string): boolean {
  const value = state.toLowerCase();
  return value === "on" || value === "charging" || value === "plugged_in" || value === "true";
}

/**
 * 从 Home Assistant webhook 摄取真实传感器事件：
 * 1. 按 ha_entity 幂等映射/创建设备
 * 2. 生成事件（风险分级）
 * 3. 调用真实 AI 分析（失败自动降级规则）
 * 4. 落库：事件 + 时间线 + 通知 + 审计
 */
export async function ingestHaEvent(payload: HaWebhookPayload, familyId: string) {
  const entityId = typeof payload.entity_id === "string" ? payload.entity_id.trim().toLowerCase() : "";
  const rawState = typeof payload.state === "string" ? payload.state.trim() : "unknown";
  const friendlyName = typeof payload.friendly_name === "string" ? payload.friendly_name.trim() : entityId || "家庭传感器";
  const familyMember = typeof payload.family_member === "string" ? payload.family_member.trim() : "家人";

  if (!entityId) {
    return { ok: false, error: "缺少 entity_id" };
  }

  const db = getDb();
  const now = nowTime();

  // ---- 0. 语义识别（用于设备命名与事件分级）----
  const disconnected = isDisconnected(rawState);
  const charging = isCharging(rawState);
  const isWifiEntity = entityId.includes("wifi") || entityId.includes("ssid") || entityId.includes("connection");
  const isBatteryEntity = entityId.includes("battery") || entityId.includes("charging") || entityId.includes("charger");
  const isPresenceEntity =
    /presence|motion|pir|activity|红外|人体|活动/.test(entityId + friendlyName);
  const isMedicineEntity = /药盒|药|medicin|pill/.test(entityId + friendlyName);
  const isSosEntity = /sos|求救|fall|摔倒|emergency/.test(entityId + friendlyName);
  const medTaken = /on|motion|opened|taken|open/.test(rawState.toLowerCase());
  const medMissed = /missed|not_taken|overdue|未服/.test(rawState.toLowerCase());
  const presenceInactive = !/on|motion|occupied|active|在家|有人/.test(rawState.toLowerCase()) && rawState.toLowerCase() !== "unknown";
  const presenceActive = /on|motion|occupied|active|在家|有人/.test(rawState.toLowerCase());

  // 设备命名按语义（不再一律叫"手机"）
  const deviceInfo = isMedicineEntity
    ? { name: "老人智能药盒", room: "卧室" }
    : isPresenceEntity
      ? { name: "客厅人体红外", room: "客厅" }
      : isWifiEntity || isBatteryEntity
        ? { name: `${familyMember}的手机`, room: "随身" }
        : { name: friendlyName || "家庭传感器", room: "客厅" };

  // ---- 1. 幂等映射设备（按 ha_entity）----
  const deviceRows = entityId
    ? await db.select().from(schema.devices).where(eq(schema.devices.haEntity, entityId)).limit(1)
    : [];
  let deviceId: string;
  if (deviceRows.length > 0) {
    deviceId = deviceRows[0].id;
    await db.update(schema.devices).set({
      name: deviceInfo.name,
      room: deviceInfo.room,
      state: rawState,
      reading: rawState,
      lastSync: nowIso(),
      online: true,
    }).where(eq(schema.devices.id, deviceId));
  } else {
    const existing = await db.select({ id: schema.devices.id }).from(schema.devices).orderBy(schema.devices.id).all();
    const maxN = existing.reduce((max, row) => {
      const match = /^D(\d+)$/.exec(row.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    deviceId = `D${String(maxN + 1).padStart(3, "0")}`;
    await db.insert(schema.devices).values({
      id: deviceId, familyId, name: deviceInfo.name, kind: "health", room: deviceInfo.room,
      state: rawState, reading: rawState, unit: null, online: true, riskLevel: "low",
      lastSync: nowIso(), source: "real", permission: "read", relatedEventIds: "[]", haEntity: entityId,
    });
  }

  // ---- 2. 事件生成与风险分级 ----

  let title: string;
  let riskLevel: "attention" | "warning" | "critical";
  let tone: TimelineEntry["tone"];
  let description: string;

  if (isSosEntity && /on|active|triggered|pressed|求救|摔倒/.test(rawState.toLowerCase())) {
    title = `${familyMember}发出紧急求救`;
    riskLevel = "critical";
    tone = "critical";
    description = `真实传感器上报：${friendlyName} 触发紧急求救（${rawState}）。${familyMember}可能摔倒或遇到危险，需要立即响应。`;
  } else if (isMedicineEntity && medTaken) {
    title = `${familyMember}已按时服药`;
    riskLevel = "attention";
    tone = "success";
    description = `真实传感器上报：${friendlyName} 检测到开盒（${rawState}）。${familyMember}在服药窗口内完成了本次服药。`;
  } else if (isMedicineEntity && medMissed) {
    title = `${familyMember}未按时服药`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 在服药截止时间未检测到开盒（${rawState}）。${familyMember}可能忘记服药，建议提醒确认。`;
  } else if (isWifiEntity && disconnected) {
    title = `${familyMember}的手机离开家庭 Wi-Fi`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 断开家庭网络（${rawState}）。${familyMember}可能已离开家，建议确认其安全与去向。`;
  } else if (isBatteryEntity && !charging) {
    title = `${familyMember}的手机停止充电`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 停止充电（${rawState}）。若在夜间长时间未充电，可能需要关注${familyMember}是否忘记充电或手机异常。`;
  } else if (isBatteryEntity && rawState.toLowerCase() === "low") {
    title = `${familyMember}的手机电量低`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 电量低（${rawState}）。独居照护场景下手机失联风险升高，建议提醒充电。`;
  } else if (isPresenceEntity && presenceActive) {
    title = `客厅有人活动`;
    riskLevel = "attention";
    tone = "info";
    description = `真实传感器上报：${friendlyName} 检测到人体活动。`;
  } else if (isPresenceEntity && presenceInactive) {
    title = `客厅长时间无人活动`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 长时间无人体活动（${rawState}）。独居照护场景下需确认${familyMember}是否安全。`;
  } else {
    title = `家庭传感器事件：${friendlyName} → ${rawState}`;
    riskLevel = "attention";
    tone = "info";
    description = `真实传感器上报：${friendlyName} 状态变为 ${rawState}（实体 ${entityId}）。`;
  }

  const eventId = randomId("E");
  const nowIsoValue = nowIso();
  const timeline: TimelineEntry[] = [{
    id: randomId("L"), time: now, title: "传感器上报", detail: `${friendlyName} → ${rawState}`,
    actor: "Home Assistant", tone,
  }];

  // ---- 3. AI 分析（失败自动降级规则）----
  let aiAssessment = "规则分析：事件已记录，等待家庭确认。";
  try {
    const result = await analyzeFamilyEvent({
      query: `家庭传感器事件：${title}。${description}`,
      familyProfile: { familyName: "林家", profile: "独居老人照护家庭，重点关注安全与失联风险。" },
    });
    const analysis = result.analysis;
    const planText = (analysis.plan ?? [])
      .map((item) => (typeof item === "string" ? item : item.title ?? ""))
      .filter(Boolean)
      .join("；");
    aiAssessment = `[${analysis.mode}] ${analysis.summary}${planText ? ` 计划：${planText}` : ""}`;
  } catch {
    aiAssessment = "规则分析（AI 暂不可用）：事件已记录，等待家庭确认。";
  }

  // ---- 4. 落库 ----
  await db.insert(schema.events).values({
    id: eventId, familyId, title, description, riskLevel, status: "pending_confirmation", source: "home_assistant",
    createdAt: nowIsoValue, updatedAt: nowIsoValue, relatedMembers: "[]", relatedDevices: JSON.stringify([deviceId]),
    relatedTasks: "[]", relatedAuthorizationId: null, aiAssessment, timeline: JSON.stringify(timeline),
  });

  await db.insert(schema.notifications).values({
    id: randomId("N"), familyId, category: riskLevel !== "attention" ? "action" : "family",
    title, detail: description, time: "刚刚", read: false, eventId,
  });

  await db.insert(schema.auditLogs).values({
    id: randomId("AL"), familyId, actor: "Home Assistant", actorType: "device",
    time: now, target: friendlyName, action: "传感器事件上报",
    reason: `实体 ${entityId} 状态 ${rawState}`, riskLevel, result: "success",
  });

  // 推送通知：新事件到达时通知家庭成员（Web Push）
  try {
    const { sendPushToFamily } = await import("./push");
    await sendPushToFamily(familyId, `新事件：${title}`, description, `/events/${eventId}`);
  } catch {
    // 推送失败不影响事件落库
  }

  return { ok: true, eventId, deviceId, title, riskLevel, aiAssessment };
}
