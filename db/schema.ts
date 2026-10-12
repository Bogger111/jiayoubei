import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// 已有表（记忆与工具调用留痕）
// ---------------------------------------------------------------------------

export const familyMemories = sqliteTable("family_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: text("family_id").notNull().default("F001"),
  member: text("member").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  importance: integer("importance").notNull().default(3),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const toolRuns = sqliteTable("tool_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: text("family_id").notNull().default("F001"),
  tool: text("tool").notNull(),
  status: text("status").notNull(),
  inputJson: text("input_json").notNull(),
  outputJson: text("output_json").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ---------------------------------------------------------------------------
// 产品域：统一以文本主键（演示数据沿用 E001/T001 等固定 ID，新建记录使用随机 ID），
// 每行携带 family_id 以便家庭级数据隔离。数组/时间线等嵌套结构以 JSON 文本存储。
// ---------------------------------------------------------------------------

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    avatar: text("avatar").notNull().default("家"),
    phone: text("phone").notNull().default(""),
    email: text("email"),
    passwordHash: text("password_hash"),
    familyId: text("family_id"),
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    uniqueIndex("users_auth_email_unique")
      .on(sql`lower(${table.email})`)
      .where(
        sql`${table.email} IS NOT NULL AND ${table.passwordHash} IS NOT NULL`,
      ),
  ],
);

export const families = sqliteTable("families", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  address: text("address").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  mode: text("mode").notNull().default("real"),
});

export const familyMembers = sqliteTable(
  "family_members",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    userId: text("user_id"),
    name: text("name").notNull(),
    relation: text("relation").notNull().default(""),
    role: text("role").notNull().default("成员"),
    avatar: text("avatar").notNull().default("家"),
    online: integer("online", { mode: "boolean" }).notNull().default(false),
    location: text("location").notNull().default(""),
    phone: text("phone").notNull().default(""),
    emergencyContact: integer("emergency_contact", { mode: "boolean" })
      .notNull()
      .default(false),
    permissions: text("permissions").notNull().default("[]"),
    currentTaskId: text("current_task_id"),
  },
  (table) => [
    index("members_family_idx").on(table.familyId),
    uniqueIndex("members_user_unique").on(table.userId),
  ],
);

export const familyInvitations = sqliteTable(
  "family_invitations",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    memberId: text("member_id").notNull(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
    joinedUserId: text("joined_user_id"),
  },
  (table) => [
    index("invitations_family_idx").on(table.familyId),
    uniqueIndex("invitations_token_unique").on(table.tokenHash),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    riskLevel: text("risk_level").notNull().default("normal"),
    status: text("status").notNull().default("monitoring"),
    source: text("source").notNull().default("family"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    relatedMembers: text("related_members").notNull().default("[]"),
    relatedDevices: text("related_devices").notNull().default("[]"),
    relatedTasks: text("related_tasks").notNull().default("[]"),
    relatedAuthorizationId: text("related_authorization_id"),
    aiAssessment: text("ai_assessment").notNull().default(""),
    timeline: text("timeline").notNull().default("[]"),
  },
  (table) => [
    index("events_family_idx").on(table.familyId),
    index("events_status_idx").on(table.familyId, table.status),
    index("events_risk_idx").on(table.familyId, table.riskLevel),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull().default(0),
    familyId: text("family_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assignee: text("assignee").notNull().default(""),
    creator: text("creator").notNull().default(""),
    sourceEventId: text("source_event_id"),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("to_receive"),
    dueAt: text("due_at"),
    evidence: text("evidence"),
    evidenceUploadedAt: text("evidence_uploaded_at"),
    familyConfirmedAt: text("family_confirmed_at"),
    helpRequested: integer("help_requested", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("tasks_family_idx").on(table.familyId),
    index("tasks_status_idx").on(table.familyId, table.status),
  ],
);

export const authorizations = sqliteTable(
  "authorizations",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    riskLevel: text("risk_level").notNull().default("normal"),
    policy: text("policy").notNull().default("ask_every_time"),
    requester: text("requester").notNull().default("AI Agent"),
    reason: text("reason").notNull().default(""),
    createdAt: text("created_at").notNull(),
    status: text("status").notNull().default("pending"),
    eventId: text("event_id"),
    consequence: text("consequence").notNull().default(""),
  },
  (table) => [
    index("authz_family_idx").on(table.familyId),
    index("authz_status_idx").on(table.familyId, table.status),
  ],
);

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("other"),
    room: text("room").notNull().default(""),
    state: text("state").notNull().default(""),
    reading: text("reading").notNull().default(""),
    unit: text("unit"),
    online: integer("online", { mode: "boolean" }).notNull().default(true),
    riskLevel: text("risk_level").notNull().default("normal"),
    lastSync: text("last_sync").notNull().default(""),
    source: text("source").notNull().default("simulator"),
    permission: text("permission").notNull().default("read"),
    relatedEventIds: text("related_event_ids").notNull().default("[]"),
    haEntity: text("ha_entity"),
  },
  (table) => [index("devices_family_idx").on(table.familyId)],
);

export const serviceProviders = sqliteTable(
  "service_providers",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default(""),
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
    coverage: text("coverage").notNull().default(""),
    contact: text("contact").notNull().default(""),
    lastUsed: text("last_used").notNull().default(""),
    trustLevel: text("trust_level").notNull().default("unverified"),
    note: text("note").notNull().default(""),
  },
  (table) => [index("services_family_idx").on(table.familyId)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    category: text("category").notNull().default("family"),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    time: text("time").notNull().default(""),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    eventId: text("event_id"),
    taskId: text("task_id"),
  },
  (table) => [
    index("notifications_family_idx").on(table.familyId),
    index("notifications_read_idx").on(table.familyId, table.read),
  ],
);

export const notificationReads = sqliteTable(
  "notification_reads",
  {
    familyId: text("family_id").notNull(),
    userId: text("user_id").notNull(),
    notificationId: text("notification_id").notNull(),
    readAt: text("read_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.familyId, table.userId, table.notificationId],
    }),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    actor: text("actor").notNull(),
    actorType: text("actor_type").notNull().default("user"),
    time: text("time").notNull().default(""),
    target: text("target").notNull().default(""),
    action: text("action").notNull().default(""),
    reason: text("reason").notNull().default(""),
    riskLevel: text("risk_level").notNull().default("normal"),
    result: text("result").notNull().default("success"),
  },
  (table) => [
    index("audit_family_idx").on(table.familyId),
    index("audit_time_idx").on(table.familyId, table.time),
  ],
);

// 阶段 6：Web Push 订阅
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("push_family_idx").on(table.familyId, table.userId)],
);
