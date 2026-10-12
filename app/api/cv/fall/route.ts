import { privateJson } from "@/lib/server/json-response";
import { readObjectBody } from "@/lib/server/request-body";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { ensureProductSchema } from "@/lib/server/product-repo";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";

/** The browser submits landmarks-derived metadata only; frames never reach this API. */
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      return privateJson(
        { error: "仅家庭管理员可开启视觉事件上报" },
        { status: 403 },
      );
    const parsed = await readObjectBody(request);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return privateJson({ error: "无效的视觉检测结果" }, { status: 400 });
    const body = parsed as Record<string, unknown>;
    const source = body.source;
    const torsoAngle = body.torsoAngle;
    const hipDrop = body.hipDrop;
    if (
      (source !== "camera" && source !== "video") ||
      typeof torsoAngle !== "number" ||
      typeof hipDrop !== "number" ||
      !Number.isFinite(torsoAngle) ||
      !Number.isFinite(hipDrop) ||
      torsoAngle < 55 ||
      torsoAngle > 90 ||
      hipDrop < 0.15 ||
      hipDrop > 1
    ) {
      return privateJson({ error: "无效的视觉检测结果" }, { status: 400 });
    }

    await ensureProductSchema();
    const db = getDb();
    const familyId = session.user.familyId;
    const sourceKey = source === "camera" ? "browser_cv" : "browser_cv_video";
    const last = await db
      .select({ id: schema.events.id, createdAt: schema.events.createdAt })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.familyId, familyId),
          eq(schema.events.source, sourceKey),
        ),
      )
      .orderBy(desc(schema.events.createdAt))
      .limit(1);
    if (last[0] && Date.now() - Date.parse(last[0].createdAt) < 60_000) {
      return privateJson({ eventId: last[0].id, deduplicated: true });
    }

    const now = new Date().toISOString();
    const id = () =>
      crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    // A deterministic bucket ID also merges concurrent reports from two tabs.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `${familyId}:${sourceKey}:${Math.floor(Date.now() / 60_000)}`,
      ),
    );
    const key = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 20)
      .toUpperCase();
    const eventId = `ECV${key}`;
    const taskId = `TCV${id()}`;
    const replay = source === "video";
    const riskLevel = replay ? "attention" : "critical";
    const title = replay ? "视频回放：疑似摔倒验证" : "视觉检测：疑似摔倒";
    const description = replay
      ? "本地视频回放触发姿态规则。这是回放验证记录，不代表当前家庭发生了摔倒；请填写观察与核实结果。视频未上传或保存。"
      : "浏览器本机姿态检测发现疑似摔倒。请立即联系本人核实；此判断可能误报，视频画面未上传或保存。";
    const admins = await db
      .select({ id: schema.familyMembers.id })
      .from(schema.familyMembers)
      .where(
        and(
          eq(schema.familyMembers.familyId, familyId),
          eq(schema.familyMembers.role, "家庭管理员"),
        ),
      )
      .limit(1);
    const assignee = admins[0]?.id ?? session.user.id;

    const eventWrite = db.insert(schema.events).values({
      id: eventId,
      familyId,
      title,
      description,
      riskLevel,
      status: "pending_confirmation",
      source: sourceKey,
      createdAt: now,
      updatedAt: now,
      relatedMembers: JSON.stringify([assignee]),
      relatedDevices: "[]",
      relatedTasks: JSON.stringify([taskId]),
      relatedAuthorizationId: null,
      aiAssessment: `浏览器姿态时序规则触发：躯干倾斜约 ${Math.round(torsoAngle)}°，髋部画面下降约 ${Math.round(hipDrop * 100)}%。需人工复核，不能据此作医疗判断。`,
      timeline: JSON.stringify([
        {
          id: `LCV${id()}`,
          time: "刚刚",
          title: "检测到疑似摔倒",
          detail: "本机连续姿态判断达到阈值，等待人工核实。",
          actor: "浏览器视觉模块",
          tone: "critical",
        },
      ]),
    });
    const taskWrite = db.insert(schema.tasks).values({
      id: taskId,
      familyId,
      title: replay ? "记录视频回放的验证结果" : "立即联系并核实疑似摔倒",
      description: replay
        ? "填写视频观察结果，记录是否触发正确、误报或存在遮挡等情况。"
        : "先联系本人，若无法确认安全，按家庭应急预案联系现场人员。",
      assignee,
      creator: "浏览器视觉模块",
      sourceEventId: eventId,
      priority: replay ? "medium" : "urgent",
      status: "to_receive",
      dueAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      evidence: null,
      evidenceUploadedAt: null,
      familyConfirmedAt: null,
      helpRequested: false,
    });
    const notificationWrite = db.insert(schema.notifications).values({
      id: `NCV${id()}`,
      familyId,
      category: replay ? "system" : "urgent",
      title: replay ? "视频回放验证记录已创建" : "疑似摔倒，等待人工核实",
      detail: description,
      time: "刚刚",
      read: false,
      eventId,
    });
    const auditWrite = db.insert(schema.auditLogs).values({
      id: `ALCV${id()}`,
      familyId,
      actor: "浏览器视觉模块",
      actorType: "device",
      time: now,
      target: eventId,
      action: replay ? "创建视频回放验证记录" : "创建疑似摔倒事件",
      reason: `${source === "camera" ? "摄像头" : "本地视频"}端侧姿态判断；仅上传数值，未上传画面`,
      riskLevel,
      result: "success",
    });
    try {
      await db.batch([eventWrite, taskWrite, notificationWrite, auditWrite]);
    } catch (cause) {
      const existing = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.id, eventId),
            eq(schema.events.familyId, familyId),
          ),
        )
        .limit(1);
      if (existing.length) return privateJson({ eventId, deduplicated: true });
      throw cause;
    }
    return privateJson({ eventId });
  } catch (error) {
    return apiError(error);
  }
}
