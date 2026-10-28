import type {
  AuditLog,
  Authorization,
  Device,
  Event,
  Family,
  FamilyMember,
  Notification,
  ServiceProvider,
  Task,
  User,
} from "@/lib/product-models";
import {
  mockAuditLogs,
  mockAuthorizations,
  mockDevices,
  mockEvents,
  mockFamily,
  mockMembers,
  mockNotifications,
  mockServices,
  mockTasks,
  mockUser,
} from "@/lib/product-mocks";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { env } from "cloudflare:workers";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { validateTaskPatch } from "@/lib/task-validation";
import { ProductInputError } from "@/lib/product-input";
import { CARE_DDL } from "./care-schema";

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// 产品域 DDL（与 drizzle/0001_product_domain.sql 保持一致；首次访问时自动建表，
// 本地 Miniflare 与线上 D1 均可自愈，无需额外迁移步骤）
const PRODUCT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, role text NOT NULL,
    avatar text DEFAULT '家' NOT NULL, phone text DEFAULT '' NOT NULL,
    email text, password_hash text, family_id text, session_version integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
  `CREATE TABLE IF NOT EXISTS families (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, owner_id text NOT NULL,
    address text DEFAULT '' NOT NULL, timezone text DEFAULT 'Asia/Shanghai' NOT NULL,
    mode text DEFAULT 'real' NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS family_members (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, name text NOT NULL,
    relation text DEFAULT '' NOT NULL, role text DEFAULT '成员' NOT NULL,
    avatar text DEFAULT '家' NOT NULL, online integer DEFAULT false NOT NULL,
    location text DEFAULT '' NOT NULL, phone text DEFAULT '' NOT NULL,
    emergency_contact integer DEFAULT false NOT NULL,
    permissions text DEFAULT '[]' NOT NULL, current_task_id text)`,
  `CREATE INDEX IF NOT EXISTS members_family_idx ON family_members (family_id)`,
  `CREATE TABLE IF NOT EXISTS family_invitations (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, member_id text NOT NULL,
    email text NOT NULL, token_hash text NOT NULL, created_by text NOT NULL,
    created_at text NOT NULL, expires_at text NOT NULL, used_at text, revoked_at text, joined_user_id text)`,
  `CREATE INDEX IF NOT EXISTS invitations_family_idx ON family_invitations (family_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_unique ON family_invitations (token_hash)`,
  `CREATE TABLE IF NOT EXISTS events (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, title text NOT NULL,
    description text DEFAULT '' NOT NULL, risk_level text DEFAULT 'normal' NOT NULL,
    status text DEFAULT 'monitoring' NOT NULL, source text DEFAULT 'family' NOT NULL,
    created_at text NOT NULL, updated_at text NOT NULL,
    related_members text DEFAULT '[]' NOT NULL, related_devices text DEFAULT '[]' NOT NULL,
    related_tasks text DEFAULT '[]' NOT NULL, related_authorization_id text,
    ai_assessment text DEFAULT '' NOT NULL, timeline text DEFAULT '[]' NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS events_family_idx ON events (family_id)`,
  `CREATE INDEX IF NOT EXISTS events_status_idx ON events (family_id, status)`,
  `CREATE INDEX IF NOT EXISTS events_risk_idx ON events (family_id, risk_level)`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, title text NOT NULL,
    description text DEFAULT '' NOT NULL, assignee text DEFAULT '' NOT NULL,
    creator text DEFAULT '' NOT NULL, source_event_id text,
    priority text DEFAULT 'medium' NOT NULL, status text DEFAULT 'to_receive' NOT NULL,
    due_at text, evidence text, evidence_uploaded_at text, family_confirmed_at text,
    help_requested integer DEFAULT false NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS tasks_family_idx ON tasks (family_id)`,
  `CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (family_id, status)`,
  `CREATE TABLE IF NOT EXISTS authorizations (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, action text NOT NULL,
    resource text NOT NULL, risk_level text DEFAULT 'normal' NOT NULL,
    policy text DEFAULT 'ask_every_time' NOT NULL, requester text DEFAULT 'AI Agent' NOT NULL,
    reason text DEFAULT '' NOT NULL, created_at text NOT NULL,
    status text DEFAULT 'pending' NOT NULL, event_id text, consequence text DEFAULT '' NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS authz_family_idx ON authorizations (family_id)`,
  `CREATE INDEX IF NOT EXISTS authz_status_idx ON authorizations (family_id, status)`,
  `CREATE TABLE IF NOT EXISTS devices (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, name text NOT NULL,
    kind text DEFAULT 'other' NOT NULL, room text DEFAULT '' NOT NULL,
    state text DEFAULT '' NOT NULL, reading text DEFAULT '' NOT NULL, unit text,
    online integer DEFAULT true NOT NULL, risk_level text DEFAULT 'normal' NOT NULL,
    last_sync text DEFAULT '' NOT NULL, source text DEFAULT 'simulator' NOT NULL,
    permission text DEFAULT 'read' NOT NULL, related_event_ids text DEFAULT '[]' NOT NULL,
    ha_entity text)`,
  `CREATE INDEX IF NOT EXISTS devices_family_idx ON devices (family_id)`,
  `CREATE TABLE IF NOT EXISTS service_providers (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, name text NOT NULL,
    category text DEFAULT '' NOT NULL, verified integer DEFAULT false NOT NULL,
    coverage text DEFAULT '' NOT NULL, contact text DEFAULT '' NOT NULL,
    last_used text DEFAULT '' NOT NULL, trust_level text DEFAULT 'unverified' NOT NULL,
    note text DEFAULT '' NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS services_family_idx ON service_providers (family_id)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL,
    category text DEFAULT 'family' NOT NULL, title text NOT NULL,
    detail text DEFAULT '' NOT NULL, time text DEFAULT '' NOT NULL,
    read integer DEFAULT false NOT NULL, event_id text, task_id text)`,
  `CREATE INDEX IF NOT EXISTS notifications_family_idx ON notifications (family_id)`,
  `CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications (family_id, read)`,
  `CREATE TABLE IF NOT EXISTS notification_reads (
    family_id text NOT NULL, user_id text NOT NULL, notification_id text NOT NULL,
    read_at text NOT NULL, PRIMARY KEY (family_id, user_id, notification_id))`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, actor text NOT NULL,
    actor_type text DEFAULT 'user' NOT NULL, time text DEFAULT '' NOT NULL,
    target text DEFAULT '' NOT NULL, action text DEFAULT '' NOT NULL,
    reason text DEFAULT '' NOT NULL, risk_level text DEFAULT 'normal' NOT NULL,
    result text DEFAULT 'success' NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_family_idx ON audit_logs (family_id)`,
  `CREATE INDEX IF NOT EXISTS audit_time_idx ON audit_logs (family_id, time)`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id text PRIMARY KEY NOT NULL, family_id text NOT NULL, user_id text NOT NULL,
    endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
    user_agent text DEFAULT '' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS push_family_idx ON push_subscriptions (family_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS family_settings (
    family_id text NOT NULL, key text NOT NULL, value text DEFAULT '' NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (family_id, key))`,
];

let productSchemaReady: Promise<void> | null = null;
export async function ensureProductSchema() {
  productSchemaReady ??= initializeProductSchema().catch((cause) => {
    productSchemaReady = null;
    throw cause;
  });
  await productSchemaReady;
}
async function initializeProductSchema() {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  await binding.batch(
    [...PRODUCT_DDL, ...CARE_DDL].map((statement) => binding.prepare(statement)),
  );
  // 已有部署的增量迁移：users 表补充登录相关列（列已存在时忽略错误）
  const usersColumns = await binding
    .prepare("PRAGMA table_info(users)")
    .all<{ name: string }>();
  const columnNames = new Set(
    (usersColumns.results ?? []).map((row) => row.name),
  );
  const userMigrations: Array<[string, string]> = [
    ["password_hash", "text"],
    ["family_id", "text"],
    ["session_version", "integer DEFAULT 0 NOT NULL"],
  ];
  for (const [column, definition] of userMigrations) {
    if (!columnNames.has(column)) {
      try {
        await binding
          .prepare(`ALTER TABLE users ADD COLUMN ${column} ${definition}`)
          .run();
      } catch (cause) {
        const columns = await binding
          .prepare("PRAGMA table_info(users)")
          .all<{ name: string }>();
        if (!columns.results.some((item) => item.name === column)) throw cause;
      }
    }
  }
  await binding
    .prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_auth_email_unique ON users (lower(email)) WHERE email IS NOT NULL AND password_hash IS NOT NULL",
    )
    .run();
  const memberColumns = await binding
    .prepare("PRAGMA table_info(family_members)")
    .all<{ name: string }>();
  if (!memberColumns.results.some((column) => column.name === "user_id")) {
    try {
      await binding
        .prepare("ALTER TABLE family_members ADD COLUMN user_id text")
        .run();
    } catch (cause) {
      const columns = await binding
        .prepare("PRAGMA table_info(family_members)")
        .all<{ name: string }>();
      if (!columns.results.some((column) => column.name === "user_id"))
        throw cause;
    }
  }
  await binding
    .prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS members_user_unique ON family_members (user_id)",
    )
    .run();
  // devices 表增量迁移：ha_entity 列（Home Assistant 实体映射）
  const deviceColumns = await binding
    .prepare("PRAGMA table_info(devices)")
    .all<{ name: string }>();
  const deviceColumnNames = new Set(
    (deviceColumns.results ?? []).map((row) => row.name),
  );
  if (!deviceColumnNames.has("ha_entity")) {
    try {
      await binding
        .prepare("ALTER TABLE devices ADD COLUMN ha_entity text")
        .run();
    } catch (cause) {
      const columns = await binding
        .prepare("PRAGMA table_info(devices)")
        .all<{ name: string }>();
      if (!columns.results.some((item) => item.name === "ha_entity"))
        throw cause;
    }
  }
  const taskColumns = await binding
    .prepare("PRAGMA table_info(tasks)")
    .all<{ name: string }>();
  if (!taskColumns.results.some((column) => column.name === "version")) {
    try {
      await binding
        .prepare(
          "ALTER TABLE tasks ADD COLUMN version integer DEFAULT 0 NOT NULL",
        )
        .run();
    } catch (cause) {
      const columns = await binding
        .prepare("PRAGMA table_info(tasks)")
        .all<{ name: string }>();
      if (!columns.results.some((column) => column.name === "version"))
        throw cause;
    }
  }
  const notificationColumns = await binding
    .prepare("PRAGMA table_info(notifications)")
    .all<{ name: string }>();
  if (
    !notificationColumns.results.some((column) => column.name === "task_id")
  ) {
    try {
      await binding
        .prepare("ALTER TABLE notifications ADD COLUMN task_id text")
        .run();
    } catch (cause) {
      const columns = await binding
        .prepare("PRAGMA table_info(notifications)")
        .all<{ name: string }>();
      if (!columns.results.some((column) => column.name === "task_id"))
        throw cause;
    }
  }
}

/** D1 单条语句最多 100 个绑定参数；按列数分块，避免 "too many SQL variables"。 */
async function insertRows(
  table: Parameters<ReturnType<typeof getDb>["insert"]>[0],
  rows: Record<string, unknown>[],
  columns: number,
) {
  const db = getDb();
  const maxRows = Math.max(1, Math.floor(100 / columns));
  for (let offset = 0; offset < rows.length; offset += maxRows) {
    await db
      .insert(table)
      .values(rows.slice(offset, offset + maxRows) as never);
  }
}

// ---------------------------------------------------------------------------
// 行 → 模型映射（D1 行结构与前端产品模型之间的唯一转换点）
// ---------------------------------------------------------------------------

const memberRow = (
  row: typeof schema.familyMembers.$inferSelect & {
    accountRole?: string | null;
  },
): FamilyMember => ({
  id: row.id,
  userId: row.userId ?? undefined,
  accountRole: row.accountRole ?? undefined,
  name: row.name,
  relation: row.relation,
  role: row.role,
  avatar: row.avatar,
  online: row.online,
  location: row.location,
  phone: row.phone,
  emergencyContact: row.emergencyContact,
  permissions: parseJson<string[]>(row.permissions, []),
  currentTaskId: row.currentTaskId ?? undefined,
});

const eventRow = (row: typeof schema.events.$inferSelect): Event => ({
  id: row.id,
  title: row.title,
  description: row.description,
  riskLevel: row.riskLevel as Event["riskLevel"],
  status: row.status as Event["status"],
  source: row.source,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  relatedMembers: parseJson<string[]>(row.relatedMembers, []),
  relatedDevices: parseJson<string[]>(row.relatedDevices, []),
  relatedTasks: parseJson<string[]>(row.relatedTasks, []),
  relatedAuthorizationId: row.relatedAuthorizationId ?? undefined,
  aiAssessment: row.aiAssessment,
  timeline: parseJson<Event["timeline"]>(row.timeline, []),
});

const taskRow = (row: typeof schema.tasks.$inferSelect): Task => ({
  id: row.id,
  version: row.version,
  title: row.title,
  description: row.description,
  assignee: row.assignee,
  creator: row.creator,
  sourceEventId: row.sourceEventId ?? "",
  priority: row.priority as Task["priority"],
  status: row.status as Task["status"],
  dueAt: row.dueAt ?? "",
  evidence: row.evidence ?? undefined,
  evidenceUploadedAt: row.evidenceUploadedAt ?? undefined,
  familyConfirmedAt: row.familyConfirmedAt ?? undefined,
  helpRequested: row.helpRequested,
});

const authzRow = (
  row: typeof schema.authorizations.$inferSelect,
): Authorization => ({
  id: row.id,
  action: row.action,
  resource: row.resource,
  riskLevel: row.riskLevel as Authorization["riskLevel"],
  policy: row.policy as Authorization["policy"],
  requester: row.requester,
  reason: row.reason,
  createdAt: row.createdAt,
  status: row.status as Authorization["status"],
  eventId: row.eventId ?? undefined,
  consequence: row.consequence,
});

const deviceRow = (row: typeof schema.devices.$inferSelect): Device => ({
  id: row.id,
  name: row.name,
  kind: row.kind as Device["kind"],
  room: row.room,
  state: row.state,
  reading: row.reading,
  unit: row.unit ?? undefined,
  online: row.online,
  riskLevel: row.riskLevel as Device["riskLevel"],
  lastSync: row.lastSync,
  source: row.source as Device["source"],
  permission: row.permission,
  relatedEventIds: parseJson<string[]>(row.relatedEventIds, []),
});

const serviceRow = (
  row: typeof schema.serviceProviders.$inferSelect,
): ServiceProvider => ({
  id: row.id,
  name: row.name,
  category: row.category,
  verified: row.verified,
  coverage: row.coverage,
  contact: row.contact,
  lastUsed: row.lastUsed,
  trustLevel: row.trustLevel as ServiceProvider["trustLevel"],
  note: row.note,
});

const notificationRow = (
  row: typeof schema.notifications.$inferSelect,
): Notification => ({
  id: row.id,
  category: row.category as Notification["category"],
  title: row.title,
  detail: row.detail,
  time: row.time,
  read: row.read,
  eventId: row.eventId ?? undefined,
  taskId: row.taskId ?? undefined,
});

const auditRow = (row: typeof schema.auditLogs.$inferSelect): AuditLog => ({
  id: row.id,
  actor: row.actor,
  actorType: row.actorType as AuditLog["actorType"],
  time: row.time,
  target: row.target,
  action: row.action,
  reason: row.reason,
  riskLevel: row.riskLevel as AuditLog["riskLevel"],
  result: row.result as AuditLog["result"],
});

// ---------------------------------------------------------------------------
// 首次访问种子：把演示家庭写入 D1，保证部署后与本地演示一致
// ---------------------------------------------------------------------------

async function seedFamilyIfEmpty(familyId: string) {
  await ensureProductSchema();
  if (
    familyId !== "F001" ||
    (env as unknown as { AUTH_MODE?: string }).AUTH_MODE === "real"
  )
    return;
  const db = getDb();
  const existing = await db
    .select({ id: schema.familyMembers.id })
    .from(schema.familyMembers)
    .where(eq(schema.familyMembers.familyId, familyId))
    .limit(1);
  if (existing.length > 0) return;

  await insertRows(
    schema.users,
    [
      {
        id: mockUser.id,
        name: mockUser.name,
        role: mockUser.role,
        avatar: mockUser.avatar,
        phone: mockUser.phone,
      },
    ],
    6,
  );
  await insertRows(
    schema.families,
    [
      {
        id: mockFamily.id,
        name: mockFamily.name,
        ownerId: mockFamily.ownerId,
        address: mockFamily.address,
        timezone: mockFamily.timezone,
        mode: "real",
      },
    ],
    6,
  );
  await insertRows(
    schema.familyMembers,
    mockMembers.map((m) => ({
      id: m.id,
      familyId,
      name: m.name,
      relation: m.relation,
      role: m.role,
      avatar: m.avatar,
      online: m.online,
      location: m.location,
      phone: m.phone,
      emergencyContact: m.emergencyContact,
      permissions: JSON.stringify(m.permissions),
      currentTaskId: m.currentTaskId,
    })),
    13,
  );
  await insertRows(
    schema.events,
    mockEvents.map((e) => ({
      id: e.id,
      familyId,
      title: e.title,
      description: e.description,
      riskLevel: e.riskLevel,
      status: e.status,
      source: e.source,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      relatedMembers: JSON.stringify(e.relatedMembers),
      relatedDevices: JSON.stringify(e.relatedDevices),
      relatedTasks: JSON.stringify(e.relatedTasks),
      relatedAuthorizationId: e.relatedAuthorizationId ?? null,
      aiAssessment: e.aiAssessment,
      timeline: JSON.stringify(e.timeline),
    })),
    15,
  );
  await insertRows(
    schema.tasks,
    mockTasks.map((t) => ({
      id: t.id,
      familyId,
      title: t.title,
      description: t.description,
      assignee: t.assignee,
      creator: t.creator,
      sourceEventId: t.sourceEventId,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt,
      evidence: t.evidence ?? null,
      evidenceUploadedAt: t.evidenceUploadedAt ?? null,
      familyConfirmedAt: t.familyConfirmedAt ?? null,
      helpRequested: t.helpRequested ?? false,
    })),
    14,
  );
  await insertRows(
    schema.authorizations,
    mockAuthorizations.map((a) => ({
      id: a.id,
      familyId,
      action: a.action,
      resource: a.resource,
      riskLevel: a.riskLevel,
      policy: a.policy,
      requester: a.requester,
      reason: a.reason,
      createdAt: a.createdAt,
      status: a.status,
      eventId: a.eventId ?? null,
      consequence: a.consequence,
    })),
    12,
  );
  await insertRows(
    schema.devices,
    mockDevices.map((d) => ({
      id: d.id,
      familyId,
      name: d.name,
      kind: d.kind,
      room: d.room,
      state: d.state,
      reading: d.reading,
      unit: d.unit ?? null,
      online: d.online,
      riskLevel: d.riskLevel,
      lastSync: d.lastSync,
      source: d.source,
      permission: d.permission,
      relatedEventIds: JSON.stringify(d.relatedEventIds),
    })),
    14,
  );
  await insertRows(
    schema.serviceProviders,
    mockServices.map((s) => ({
      id: s.id,
      familyId,
      name: s.name,
      category: s.category,
      verified: s.verified,
      coverage: s.coverage,
      contact: s.contact,
      lastUsed: s.lastUsed,
      trustLevel: s.trustLevel,
      note: s.note,
    })),
    10,
  );
  await insertRows(
    schema.notifications,
    mockNotifications.map((n) => ({
      id: n.id,
      familyId,
      category: n.category,
      title: n.title,
      detail: n.detail,
      time: n.time,
      read: n.read,
      eventId: n.eventId ?? null,
    })),
    8,
  );
  await insertRows(
    schema.auditLogs,
    mockAuditLogs.map((a) => ({
      id: a.id,
      familyId,
      actor: a.actor,
      actorType: a.actorType,
      time: a.time,
      target: a.target,
      action: a.action,
      reason: a.reason,
      riskLevel: a.riskLevel,
      result: a.result,
    })),
    10,
  );
}

// ---------------------------------------------------------------------------
// 读取
// ---------------------------------------------------------------------------

export async function readProductState(familyId: string, user: User) {
  await seedFamilyIfEmpty(familyId);
  if ((env as unknown as { AUTH_MODE?: string }).AUTH_MODE === "real") {
    await getDb()
      .insert(schema.families)
      .values({
        id: familyId,
        name: `${user.name}的家庭`,
        ownerId: user.id,
        address: "",
        timezone: "Asia/Shanghai",
        mode: "real",
      })
      .onConflictDoNothing();
    const members = await getDb()
      .select({ id: schema.familyMembers.id })
      .from(schema.familyMembers)
      .where(
        and(
          eq(schema.familyMembers.familyId, familyId),
          eq(schema.familyMembers.userId, user.id),
        ),
      );
    if (!members.length)
      await getDb()
        .insert(schema.familyMembers)
        .values({
          id: `M_${user.id}`,
          familyId,
          userId: user.id,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          relation: "户主",
          phone: user.phone,
          online: true,
          location: "未共享",
          permissions: "[]",
        })
        .onConflictDoNothing();
  }

  const db = getDb();
  const [
    familyRows,
    memberRows,
    eventRows,
    taskRows,
    authzRows,
    deviceRows,
    serviceRows,
    notificationRows,
    auditRows,
  ] = await Promise.all([
    db
      .select()
      .from(schema.families)
      .where(eq(schema.families.id, familyId))
      .limit(1),
    linkedMemberRows(familyId),
    db.select().from(schema.events).where(eq(schema.events.familyId, familyId)),
    db.select().from(schema.tasks).where(eq(schema.tasks.familyId, familyId)),
    db
      .select()
      .from(schema.authorizations)
      .where(eq(schema.authorizations.familyId, familyId)),
    db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.familyId, familyId)),
    db
      .select()
      .from(schema.serviceProviders)
      .where(eq(schema.serviceProviders.familyId, familyId)),
    readNotifications(familyId, user.id),
    db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.familyId, familyId)),
  ]);
  const family = familyRows[0];
  if (!family || !user) throw new Error("家庭或用户数据缺失");

  return {
    family: {
      id: family.id,
      name: family.name,
      ownerId: family.ownerId,
      address: family.address,
      timezone: family.timezone,
      mode: family.mode as Family["mode"],
    },
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
    } satisfies User,
    members: memberRows.map(memberRow),
    events: eventRows.map(eventRow),
    tasks: taskRows.map(taskRow),
    authorizations: authzRows.map(authzRow),
    devices: deviceRows.map(deviceRow),
    services: serviceRows.map(serviceRow),
    notifications: notificationRows,
    auditLogs: auditRows.map(auditRow),
  };
}

// ---------------------------------------------------------------------------
// 写操作（均由对应 route handler 在鉴权后调用）
// ---------------------------------------------------------------------------

export async function updateTask(
  familyId: string,
  id: string,
  patch: Record<string, unknown>,
  actor = "家庭成员",
) {
  const db = getDb();
  const current = await findTask(familyId, id);
  if (!current) return null;
  if (current.sourceEventId?.startsWith("CARE-")) throw new ProductInputError("请在关怀确认中接手任务并记录明确结果",409);
  const timestamp = new Date().toISOString();
  const allowed = validateTaskPatch(current, patch, timestamp);
  const version = current.version ?? 0;
  if (allowed.assignee !== undefined) {
    const members = await db
      .select({ id: schema.familyMembers.id })
      .from(schema.familyMembers)
      .where(
        and(
          eq(schema.familyMembers.id, allowed.assignee),
          eq(schema.familyMembers.familyId, familyId),
        ),
      )
      .limit(1);
    if (!members.length) throw new Error("无权转交给其他家庭的成员");
  }
  const action =
    allowed.status === "completed"
      ? "确认任务完成"
      : allowed.evidence !== undefined
        ? "保存任务处理记录"
        : allowed.status === "in_progress"
          ? "接受家庭任务"
          : allowed.assignee !== undefined
            ? "转交家庭任务"
            : allowed.helpRequested
              ? "请求家庭成员帮助"
              : "更新家庭任务";
  const taskWrite = db
    .update(schema.tasks)
    .set({ ...allowed, version: version + 1 })
    .where(
      and(
        eq(schema.tasks.id, id),
        eq(schema.tasks.familyId, familyId),
        eq(schema.tasks.version, version),
      ),
    );
  const auditWrite = db.insert(schema.auditLogs).values({
    id: `ALT:${id}:${version}`,
    familyId,
    actor,
    actorType: "user",
    time: timestamp,
    target: id,
    action,
    reason: "家庭成员主动操作，服务端校验后保存",
    riskLevel: current.priority === "urgent" ? "critical" : "attention",
    result: "success",
  });
  const notificationWrites = [];
  if (allowed.helpRequested === true && !current.helpRequested) {
    notificationWrites.push(
      db.insert(schema.notifications).values({
        id: `N_HELP:${id}:${version}`,
        familyId,
        category: "action",
        title: `${actor}请求协助：${current.title}`,
        detail: "家人主动请求协助，请打开任务核对情况。接手后会更新负责人。",
        time: timestamp,
        read: false,
        taskId: id,
        eventId: current.sourceEventId || null,
      }),
    );
  } else if (current.helpRequested && allowed.helpRequested === false) {
    notificationWrites.push(
      db
        .update(schema.notifications)
        .set({ read: true })
        .where(
          and(
            eq(schema.notifications.familyId, familyId),
            eq(schema.notifications.taskId, id),
          ),
        ),
    );
  }
  if (allowed.status === "completed" && current.sourceEventId) {
    const entry = JSON.stringify({
      id: `LT${crypto.randomUUID().slice(0, 12)}`,
      time: timestamp,
      title: "任务完成已回传",
      detail: `${current.title}已由${actor}核对处理记录并确认完成。`,
      actor,
      tone: "success",
    });
    const eventWrite = db
      .update(schema.events)
      .set({
        updatedAt: timestamp,
        timeline: sql`json_insert(${schema.events.timeline}, '$[#]', json(${entry}))`,
        status: sql`CASE WHEN ${schema.events.status} <> 'closed' AND NOT EXISTS (SELECT 1 FROM tasks WHERE family_id = ${familyId} AND source_event_id = ${current.sourceEventId} AND status <> 'completed') AND NOT EXISTS (SELECT 1 FROM authorizations WHERE family_id = ${familyId} AND event_id = ${current.sourceEventId} AND status = 'pending') THEN 'resolved' ELSE ${schema.events.status} END`,
      })
      .where(
        and(
          eq(schema.events.id, current.sourceEventId),
          eq(schema.events.familyId, familyId),
        ),
      );
    try {
      await db.batch([
        taskWrite,
        eventWrite,
        auditWrite,
        ...notificationWrites,
      ]);
    } catch (cause) {
      if ((await findTask(familyId, id))?.version !== version)
        throw new ProductInputError(
          "任务已更新，请重新加载后核对处理记录",
          409,
        );
      throw cause;
    }
  } else {
    try {
      await db.batch([taskWrite, auditWrite, ...notificationWrites]);
    } catch (cause) {
      if ((await findTask(familyId, id))?.version !== version)
        throw new ProductInputError(
          "任务已更新，请重新加载后核对处理记录",
          409,
        );
      throw cause;
    }
  }
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.familyId, familyId)))
    .limit(1);
  return rows[0] ? taskRow(rows[0]) : null;
}

export async function updateEvent(
  familyId: string,
  id: string,
  patch: Record<string, unknown>,
  actor = "家庭成员",
) {
  const current = await findEvent(familyId, id);
  if (!current) return null;
  if (id.startsWith("CARE-")) throw new ProductInputError("请在关怀确认中记录结果，不能直接改为已解决",409);
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new ProductInputError("事件更新格式不正确");
  const supported = ["title", "description", "status"];
  if (
    !Object.keys(patch).length ||
    Object.keys(patch).some((key) => !supported.includes(key))
  )
    throw new ProductInputError("事件字段不允许直接修改");
  const allowed: {
    title?: string;
    description?: string;
    status?: string;
    updatedAt: string;
  } = { updatedAt: new Date().toISOString() };
  for (const key of ["title", "description"] as const) {
    if (patch[key] !== undefined) {
      const value = patch[key];
      if (
        typeof value !== "string" ||
        value.length > 4000 ||
        (key === "title" && !value.trim())
      )
        throw new ProductInputError("事件内容格式不正确");
      allowed[key] = value.trim();
    }
  }
  if (patch.status !== undefined) {
    if (
      typeof patch.status !== "string" ||
      !["monitoring", "processing", "closed"].includes(patch.status)
    )
      throw new ProductInputError("请通过人工核实任务确认事件解决");
    if (
      current.status === "closed" ||
      (current.status === "resolved" && patch.status !== "closed")
    )
      throw new ProductInputError("已结束的事件不能重新推进", 409);
    if (patch.status === "closed" && current.status !== "resolved")
      throw new ProductInputError("事件解决后才能归档", 409);
    allowed.status = patch.status;
  }
  const db = getDb();
  await db.batch([
    db
      .update(schema.events)
      .set(allowed)
      .where(
        and(eq(schema.events.id, id), eq(schema.events.familyId, familyId)),
      ),
    db.insert(schema.auditLogs).values({
      id: `ALE_${crypto.randomUUID()}`,
      familyId,
      actor,
      actorType: "user",
      time: allowed.updatedAt,
      target: id,
      action: "更新事件记录",
      reason: allowed.status ? `状态：${allowed.status}` : "修改事件描述",
      riskLevel: current.riskLevel,
      result: "success",
    }),
  ]);
  return findEvent(familyId, id);
}

export async function updateAuthorization(
  familyId: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const db = getDb();
  const allowed: Record<string, unknown> = {};
  for (const key of ["policy", "status"] as const) {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  }
  if (Object.keys(allowed).length === 0) return null;
  await db
    .update(schema.authorizations)
    .set(allowed)
    .where(
      and(
        eq(schema.authorizations.id, id),
        eq(schema.authorizations.familyId, familyId),
      ),
    );
  const rows = await db
    .select()
    .from(schema.authorizations)
    .where(
      and(
        eq(schema.authorizations.id, id),
        eq(schema.authorizations.familyId, familyId),
      ),
    )
    .limit(1);
  return rows[0] ? authzRow(rows[0]) : null;
}

export async function findAuthorization(familyId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(schema.authorizations)
    .where(
      and(
        eq(schema.authorizations.id, id),
        eq(schema.authorizations.familyId, familyId),
      ),
    )
    .limit(1);
  return rows[0] ? authzRow(rows[0]) : null;
}

async function readNotifications(familyId: string, userId: string) {
  const realAuth =
    (env as unknown as { AUTH_MODE?: string }).AUTH_MODE === "real";
  const rows = await getDb()
    .select({
      ...getTableColumns(schema.notifications),
      read: realAuth
        ? sql<boolean>`CASE WHEN ${schema.notifications.read} = 1 OR EXISTS (
      SELECT 1 FROM notification_reads r WHERE r.family_id = ${familyId}
      AND r.user_id = ${userId} AND r.notification_id = ${schema.notifications.id}
    ) THEN 1 ELSE 0 END`.mapWith(Boolean)
        : schema.notifications.read,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.familyId, familyId))
    .orderBy(
      sql`datetime(${schema.notifications.time}) DESC`,
      sql`${schema.notifications.time} DESC`,
      sql`${schema.notifications.id} DESC`,
    );
  return rows.map(notificationRow);
}

export async function markNotificationRead(
  familyId: string,
  userId: string,
  id?: string,
) {
  await ensureProductSchema();
  const db = getDb();
  if ((env as unknown as { AUTH_MODE?: string }).AUTH_MODE === "real") {
    if (id) {
      const [notice] = await db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.familyId, familyId),
            eq(schema.notifications.id, id),
          ),
        )
        .limit(1);
      if (!notice) throw new ProductInputError("通知不存在", 404);
    }
    const binding = (env as unknown as { DB: D1Database }).DB;
    const query = `INSERT INTO notification_reads (family_id,user_id,notification_id,read_at)
      SELECT family_id,?,id,? FROM notifications WHERE family_id=?${id ? " AND id=?" : ""}
      ON CONFLICT (family_id,user_id,notification_id) DO NOTHING`;
    const values = [
      userId,
      new Date().toISOString(),
      familyId,
      ...(id ? [id] : []),
    ];
    await binding
      .prepare(query)
      .bind(...values)
      .run();
    return;
  }
  if (id) {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.familyId, familyId),
        ),
      );
  } else {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.familyId, familyId));
  }
}

export async function appendAudit(
  familyId: string,
  entry: Omit<AuditLog, "id">,
) {
  const db = getDb();
  const id = `AL${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await db.insert(schema.auditLogs).values({
    id,
    familyId,
    actor: entry.actor,
    actorType: entry.actorType,
    time: entry.time,
    target: entry.target,
    action: entry.action,
    reason: entry.reason,
    riskLevel: entry.riskLevel,
    result: entry.result,
  });
  return { ...entry, id };
}

export async function listEvents(familyId: string) {
  const rows = await getDb()
    .select()
    .from(schema.events)
    .where(eq(schema.events.familyId, familyId));
  return rows.map(eventRow);
}

export async function findEvent(familyId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.id, id), eq(schema.events.familyId, familyId)))
    .limit(1);
  return rows[0] ? eventRow(rows[0]) : null;
}

export async function listTasks(familyId: string) {
  const rows = await getDb()
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.familyId, familyId));
  return rows.map(taskRow);
}

export async function findTask(familyId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.familyId, familyId)))
    .limit(1);
  return rows[0] ? taskRow(rows[0]) : null;
}

export async function listDevices(familyId: string) {
  const rows = await getDb()
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.familyId, familyId));
  return rows.map(deviceRow);
}

async function linkedMemberRows(familyId: string) {
  return getDb()
    .select({
      ...getTableColumns(schema.familyMembers),
      accountRole: schema.users.role,
    })
    .from(schema.familyMembers)
    .leftJoin(
      schema.users,
      and(
        eq(schema.familyMembers.userId, schema.users.id),
        eq(schema.users.familyId, familyId),
      ),
    )
    .where(eq(schema.familyMembers.familyId, familyId));
}

export async function currentFamily(familyId: string) {
  const db = getDb();
  const [familyRows, memberRows] = await Promise.all([
    db
      .select()
      .from(schema.families)
      .where(eq(schema.families.id, familyId))
      .limit(1),
    linkedMemberRows(familyId),
  ]);
  const family = familyRows[0];
  if (!family) return null;
  return {
    family: {
      id: family.id,
      name: family.name,
      ownerId: family.ownerId,
      address: family.address,
      timezone: family.timezone,
      mode: family.mode as Family["mode"],
    },
    members: memberRows.map(memberRow),
  };
}
