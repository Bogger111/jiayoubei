import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { analyzeFamilyEvent } from "@/lib/agent-engine";
import type { TimelineEntry } from "@/lib/product-models";
import { signalState } from "@/lib/device-signals";

export type HaWebhookPayload = {
  entity_id?: unknown;
  state?: unknown;
  friendly_name?: unknown;
  family_member?: unknown;
  message?: unknown;
};

const randomId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const nowIso = () => new Date().toISOString();

function isDisconnected(state: string): boolean {
  const value = state.toLowerCase();
  return (
    value === "unknown" ||
    value === "unavailable" ||
    value === "off" ||
    value === "disconnected" ||
    value === "" ||
    value === "not_home"
  );
}

function isCharging(state: string): boolean {
  const value = state.toLowerCase();
  return (
    value === "on" ||
    value === "charging" ||
    value === "plugged_in" ||
    value === "true"
  );
}

/**
 * 从 Home Assistant webhook 摄取真实传感器事件：
 * 1. 按 ha_entity 幂等映射/创建设备
 * 2. 生成事件（风险分级）
 * 3. 调用真实 AI 分析（失败自动降级规则）
 * 4. 落库：事件 + 时间线 + 通知 + 审计
 */
export async function ingestHaEvent(
  payload: HaWebhookPayload,
  familyId: string,
) {
  const entityId =
    typeof payload.entity_id === "string"
      ? payload.entity_id.trim().toLowerCase()
      : "";
  const rawState =
    typeof payload.state === "string" ? payload.state.trim() : "unknown";
  const friendlyName =
    typeof payload.friendly_name === "string"
      ? payload.friendly_name.trim()
      : entityId || "家庭传感器";
  const familyMember =
    typeof payload.family_member === "string"
      ? payload.family_member.trim() || "家人（待确认）"
      : "家人（待确认）";

  if (!entityId) {
    return { ok: false, error: "缺少 entity_id" };
  }

  const db = getDb();
  const now = nowIso();

  // ---- 0. 语义识别（用于设备命名与事件分级）----
  const disconnected = isDisconnected(rawState);
  const charging = isCharging(rawState);
  const isWifiEntity =
    entityId.includes("wifi") ||
    entityId.includes("ssid") ||
    entityId.includes("connection");
  const isBatteryEntity =
    entityId.includes("battery") ||
    entityId.includes("charging") ||
    entityId.includes("charger");
  const isChargingEntity = /charging|charger/.test(entityId);
  const isPresenceEntity = /presence|motion|pir|activity|红外|人体|活动/.test(
    entityId + friendlyName,
  );
  const isMedicineEntity = /药盒|药|medicin|pill/.test(entityId + friendlyName);
  const isSosEntity = /sos|求救|fall|摔倒|emergency/.test(
    entityId + friendlyName,
  );
  const medOpened = ["on", "opened", "open", "true", "1"].includes(
    rawState.toLowerCase(),
  );
  const medMissed = ["missed", "not_taken", "overdue", "未服"].includes(
    rawState.toLowerCase(),
  );
  const presenceInactive = signalState(rawState) === "inactive";
  const presenceActive = signalState(rawState) === "active";

  // 设备命名按语义（不再一律叫"手机"）
  const deviceInfo = isMedicineEntity
    ? { name: friendlyName || "智能药盒", room: "未分配房间" }
    : isPresenceEntity
      ? { name: friendlyName || "人体传感器", room: "未分配房间" }
      : isWifiEntity || isBatteryEntity
        ? { name: `${familyMember}的手机`, room: "随身" }
        : { name: friendlyName || "家庭传感器", room: "客厅" };

  // ---- 1. 幂等映射设备（按 ha_entity）----
  const deviceRows = entityId
    ? await db
        .select()
        .from(schema.devices)
        .where(
          and(
            eq(schema.devices.haEntity, entityId),
            eq(schema.devices.familyId, familyId),
          ),
        )
        .limit(1)
    : [];
  let deviceId: string;
  if (deviceRows.length > 0) {
    deviceId = deviceRows[0].id;
    await db
      .update(schema.devices)
      .set({
        name: deviceInfo.name,
        room: deviceInfo.room,
        state: rawState,
        reading: rawState,
        lastSync: nowIso(),
        online: !["unknown", "unavailable"].includes(rawState.toLowerCase()),
      })
      .where(eq(schema.devices.id, deviceId));
  } else {
    deviceId = `D_${crypto.randomUUID()}`;
    await db.insert(schema.devices).values({
      id: deviceId,
      familyId,
      name: deviceInfo.name,
      kind: isPresenceEntity
        ? "security"
        : isMedicineEntity || isBatteryEntity
          ? "health"
          : "other",
      room: deviceInfo.room,
      state: rawState,
      reading: rawState,
      unit: null,
      online: !["unknown", "unavailable"].includes(rawState.toLowerCase()),
      riskLevel: "normal",
      lastSync: nowIso(),
      source: "real",
      permission: "read",
      relatedEventIds: "[]",
      haEntity: entityId,
    });
  }

  // ---- 2. 事件生成与风险分级 ----

  let title: string;
  let riskLevel: "attention" | "warning" | "critical";
  let tone: TimelineEntry["tone"];
  let description: string;

  if (isSosEntity && signalState(rawState) === "active") {
    title = `${familyMember}发出紧急求救`;
    riskLevel = "critical";
    tone = "critical";
    description = `真实传感器上报：${friendlyName} 触发紧急求救（${rawState}）。${familyMember}可能摔倒或遇到危险，需要立即响应。`;
  } else if (isMedicineEntity && medOpened) {
    title = `${familyMember}的药盒已打开`;
    riskLevel = "attention";
    tone = "success";
    description = `真实传感器上报：${friendlyName} 检测到开盒（${rawState}）。开盒信号不能证明已服药，实际服药情况需要人工核实。`;
  } else if (isMedicineEntity && medMissed) {
    title = `${familyMember}的药盒上报超时`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 状态为 ${rawState}。请核对上游服药提醒窗口并人工确认实际情况。`;
  } else if (isWifiEntity && disconnected) {
    title = `${familyMember}的手机离开家庭 Wi-Fi`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 断开家庭网络（${rawState}）。${familyMember}可能已离开家，建议确认其安全与去向。`;
  } else if (
    isChargingEntity &&
    !charging &&
    signalState(rawState) === "inactive"
  ) {
    title = `${familyMember}的手机停止充电`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 停止充电（${rawState}）。若在夜间长时间未充电，可能需要关注${familyMember}是否忘记充电或手机异常。`;
  } else if (
    isBatteryEntity &&
    (rawState.toLowerCase() === "low" ||
      (/^\d+(\.\d+)?$/.test(rawState) && Number(rawState) <= 15))
  ) {
    title = `${familyMember}的手机电量低`;
    riskLevel = "warning";
    tone = "warning";
    description = `真实传感器上报：${friendlyName} 电量低（${rawState}）。独居照护场景下手机失联风险升高，建议提醒充电。`;
  } else if (isPresenceEntity && presenceActive) {
    title = `${friendlyName}检测到活动`;
    riskLevel = "attention";
    tone = "info";
    description = `真实传感器上报：${friendlyName} 检测到人体活动。`;
  } else if (isPresenceEntity && presenceInactive) {
    title = `${friendlyName}暂未检测到活动`;
    riskLevel = "attention";
    tone = "info";
    description = `真实传感器上报：${friendlyName} 状态为 ${rawState}。单次状态不包含持续时长，也不能证明人员异常。`;
  } else {
    title = `家庭传感器事件：${friendlyName} → ${rawState}`;
    riskLevel = "attention";
    tone = "info";
    description = `真实传感器上报：${friendlyName} 状态变为 ${rawState}（实体 ${entityId}）。`;
  }

  const eventId = randomId("E");
  const nowIsoValue = nowIso();
  const timeline: TimelineEntry[] = [
    {
      id: randomId("L"),
      time: now,
      title: "传感器上报",
      detail: `${friendlyName} → ${rawState}`,
      actor: "Home Assistant",
      tone,
    },
  ];

  // ---- 3. AI 分析（失败自动降级规则）----
  let aiAssessment = "规则分析：事件已记录，等待家庭确认。";
  try {
    const result = await analyzeFamilyEvent({
      familyId,
      query: `家庭传感器事件：${title}。${description}`,
      familyProfile: { familyId },
    });
    const analysis = result.analysis;
    const planText = (analysis.plan ?? [])
      .map((item) => (typeof item === "string" ? item : (item.title ?? "")))
      .filter(Boolean)
      .join("；");
    aiAssessment = `[${analysis.mode}] ${analysis.summary}${planText ? ` 计划：${planText}` : ""}`;
  } catch {
    aiAssessment = "规则分析（AI 暂不可用）：事件已记录，等待家庭确认。";
  }

  // ---- 4. 落库 ----
  const eventWrite = db.insert(schema.events).values({
    id: eventId,
    familyId,
    title,
    description,
    riskLevel,
    status: "pending_confirmation",
    source: "home_assistant",
    createdAt: nowIsoValue,
    updatedAt: nowIsoValue,
    relatedMembers: "[]",
    relatedDevices: JSON.stringify([deviceId]),
    relatedTasks: "[]",
    relatedAuthorizationId: null,
    aiAssessment,
    timeline: JSON.stringify(timeline),
  });

  const notificationWrite = db.insert(schema.notifications).values({
    id: randomId("N"),
    familyId,
    category: riskLevel !== "attention" ? "action" : "family",
    title,
    detail: description,
    time: nowIsoValue,
    read: false,
    eventId,
  });

  const auditWrite = db.insert(schema.auditLogs).values({
    id: randomId("AL"),
    familyId,
    actor: "Home Assistant",
    actorType: "device",
    time: now,
    target: friendlyName,
    action: "传感器事件上报",
    reason: `实体 ${entityId} 状态 ${rawState}`,
    riskLevel,
    result: "success",
  });
  const deviceWrite = db
    .update(schema.devices)
    .set({ riskLevel })
    .where(
      and(
        eq(schema.devices.id, deviceId),
        eq(schema.devices.familyId, familyId),
      ),
    );
  await db.batch([eventWrite, notificationWrite, auditWrite, deviceWrite]);

  // 推送通知：新事件到达时通知家庭成员（Web Push）
  try {
    const { sendPushToFamily } = await import("./push");
    await sendPushToFamily(
      familyId,
      `新事件：${title}`,
      description,
      `/events/${eventId}`,
    );
  } catch {
    // 推送失败不影响事件落库
  }

  return { ok: true, eventId, deviceId, title, riskLevel, aiAssessment };
}
