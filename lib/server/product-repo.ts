import type { AuditLog, Authorization, Device, Event, Family, FamilyMember, Notification, ServiceProvider, Task, User } from "@/lib/product-models";
import {
  mockAuditLogs, mockAuthorizations, mockDevices, mockEvents, mockFamily, mockMembers, mockNotifications, mockServices, mockTasks, mockUser,
} from "@/lib/product-mocks";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

const parseJson = <T,>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
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
    read integer DEFAULT false NOT NULL, event_id text)`,
  `CREATE INDEX IF NOT EXISTS notifications_family_idx ON notifications (family_id)`,
  `CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications (family_id, read)`,
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

export async function ensureProductSchema() {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  await binding.batch(PRODUCT_DDL.map((statement) => binding.prepare(statement)));
  // 已有部署的增量迁移：users 表补充登录相关列（列已存在时忽略错误）
  const usersColumns = await binding.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const columnNames = new Set((usersColumns.results ?? []).map((row) => row.name));
  const userMigrations: Array<[string, string]> = [
    ["password_hash", "text"],
    ["family_id", "text"],
    ["session_version", "integer DEFAULT 0 NOT NULL"],
  ];
  for (const [column, definition] of userMigrations) {
    if (!columnNames.has(column)) {
      try {
        await binding.prepare(`ALTER TABLE users ADD COLUMN ${column} ${definition}`).run();
      } catch {
        // 并发创建时列可能已存在，忽略
      }
    }
  }
  // devices 表增量迁移：ha_entity 列（Home Assistant 实体映射）
  const deviceColumns = await binding.prepare("PRAGMA table_info(devices)").all<{ name: string }>();
  const deviceColumnNames = new Set((deviceColumns.results ?? []).map((row) => row.name));
  if (!deviceColumnNames.has("ha_entity")) {
    try {
      await binding.prepare("ALTER TABLE devices ADD COLUMN ha_entity text").run();
    } catch {
      // 并发竞争忽略
    }
  }
}

/** D1 单条语句最多 100 个绑定参数；按列数分块，避免 "too many SQL variables"。 */
async function insertRows(table: Parameters<ReturnType<typeof getDb>["insert"]>[0], rows: Record<string, unknown>[], columns: number) {
  const db = getDb();
  const maxRows = Math.max(1, Math.floor(100 / columns));
  for (let offset = 0; offset < rows.length; offset += maxRows) {
    await db.insert(table).values(rows.slice(offset, offset + maxRows) as never);
  }
}

// ---------------------------------------------------------------------------
// 行 → 模型映射（D1 行结构与前端产品模型之间的唯一转换点）
// ---------------------------------------------------------------------------

const memberRow = (row: typeof schema.familyMembers.$inferSelect): FamilyMember => ({
  id: row.id, name: row.name, relation: row.relation, role: row.role, avatar: row.avatar,
  online: row.online, location: row.location, phone: row.phone,
  emergencyContact: row.emergencyContact, permissions: parseJson<string[]>(row.permissions, []),
  currentTaskId: row.currentTaskId ?? undefined,
});

const eventRow = (row: typeof schema.events.$inferSelect): Event => ({
  id: row.id, title: row.title, description: row.description, riskLevel: row.riskLevel as Event["riskLevel"],
  status: row.status as Event["status"], source: row.source, createdAt: row.createdAt, updatedAt: row.updatedAt,
  relatedMembers: parseJson<string[]>(row.relatedMembers, []), relatedDevices: parseJson<string[]>(row.relatedDevices, []),
  relatedTasks: parseJson<string[]>(row.relatedTasks, []), relatedAuthorizationId: row.relatedAuthorizationId ?? undefined,
  aiAssessment: row.aiAssessment, timeline: parseJson<Event["timeline"]>(row.timeline, []),
});

const taskRow = (row: typeof schema.tasks.$inferSelect): Task => ({
  id: row.id, title: row.title, description: row.description, assignee: row.assignee, creator: row.creator,
  sourceEventId: row.sourceEventId ?? "", priority: row.priority as Task["priority"], status: row.status as Task["status"],
  dueAt: row.dueAt ?? "", evidence: row.evidence ?? undefined, evidenceUploadedAt: row.evidenceUploadedAt ?? undefined,
  familyConfirmedAt: row.familyConfirmedAt ?? undefined, helpRequested: row.helpRequested,
});

const authzRow = (row: typeof schema.authorizations.$inferSelect): Authorization => ({
  id: row.id, action: row.action, resource: row.resource, riskLevel: row.riskLevel as Authorization["riskLevel"],
  policy: row.policy as Authorization["policy"], requester: row.requester, reason: row.reason,
  createdAt: row.createdAt, status: row.status as Authorization["status"], eventId: row.eventId ?? undefined,
  consequence: row.consequence,
});

const deviceRow = (row: typeof schema.devices.$inferSelect): Device => ({
  id: row.id, name: row.name, kind: row.kind as Device["kind"], room: row.room, state: row.state,
  reading: row.reading, unit: row.unit ?? undefined, online: row.online, riskLevel: row.riskLevel as Device["riskLevel"],
  lastSync: row.lastSync, source: row.source as Device["source"], permission: row.permission,
  relatedEventIds: parseJson<string[]>(row.relatedEventIds, []),
});

const serviceRow = (row: typeof schema.serviceProviders.$inferSelect): ServiceProvider => ({
  id: row.id, name: row.name, category: row.category, verified: row.verified, coverage: row.coverage,
  contact: row.contact, lastUsed: row.lastUsed, trustLevel: row.trustLevel as ServiceProvider["trustLevel"], note: row.note,
});

const notificationRow = (row: typeof schema.notifications.$inferSelect): Notification => ({
  id: row.id, category: row.category as Notification["category"], title: row.title, detail: row.detail,
  time: row.time, read: row.read, eventId: row.eventId ?? undefined,
});

const auditRow = (row: typeof schema.auditLogs.$inferSelect): AuditLog => ({
  id: row.id, actor: row.actor, actorType: row.actorType as AuditLog["actorType"], time: row.time,
  target: row.target, action: row.action, reason: row.reason, riskLevel: row.riskLevel as AuditLog["riskLevel"],
  result: row.result as AuditLog["result"],
});

// ---------------------------------------------------------------------------
// 首次访问种子：把演示家庭写入 D1，保证部署后与本地演示一致
// ---------------------------------------------------------------------------

async function seedFamilyIfEmpty(familyId: string) {
  await ensureProductSchema();
  const db = getDb();
  const existing = await db.select({ id: schema.familyMembers.id }).from(schema.familyMembers).where(eq(schema.familyMembers.familyId, familyId)).limit(1);
  if (existing.length > 0) return;

  await insertRows(schema.users, [{ id: mockUser.id, name: mockUser.name, role: mockUser.role, avatar: mockUser.avatar, phone: mockUser.phone }], 6);
  await insertRows(schema.families, [{ id: mockFamily.id, name: mockFamily.name, ownerId: mockFamily.ownerId, address: mockFamily.address, timezone: mockFamily.timezone, mode: "real" }], 6);
  await insertRows(schema.familyMembers, mockMembers.map((m) => ({
    id: m.id, familyId, name: m.name, relation: m.relation, role: m.role, avatar: m.avatar,
    online: m.online, location: m.location, phone: m.phone, emergencyContact: m.emergencyContact,
    permissions: JSON.stringify(m.permissions), currentTaskId: m.currentTaskId,
  })), 12);
  await insertRows(schema.events, mockEvents.map((e) => ({
    id: e.id, familyId, title: e.title, description: e.description, riskLevel: e.riskLevel, status: e.status,
    source: e.source, createdAt: e.createdAt, updatedAt: e.updatedAt, relatedMembers: JSON.stringify(e.relatedMembers),
    relatedDevices: JSON.stringify(e.relatedDevices), relatedTasks: JSON.stringify(e.relatedTasks),
    relatedAuthorizationId: e.relatedAuthorizationId ?? null, aiAssessment: e.aiAssessment, timeline: JSON.stringify(e.timeline),
  })), 15);
  await insertRows(schema.tasks, mockTasks.map((t) => ({
    id: t.id, familyId, title: t.title, description: t.description, assignee: t.assignee, creator: t.creator,
    sourceEventId: t.sourceEventId, priority: t.priority, status: t.status, dueAt: t.dueAt,
    evidence: t.evidence ?? null, evidenceUploadedAt: t.evidenceUploadedAt ?? null,
    familyConfirmedAt: t.familyConfirmedAt ?? null, helpRequested: t.helpRequested ?? false,
  })), 14);
  await insertRows(schema.authorizations, mockAuthorizations.map((a) => ({
    id: a.id, familyId, action: a.action, resource: a.resource, riskLevel: a.riskLevel, policy: a.policy,
    requester: a.requester, reason: a.reason, createdAt: a.createdAt, status: a.status,
    eventId: a.eventId ?? null, consequence: a.consequence,
  })), 12);
  await insertRows(schema.devices, mockDevices.map((d) => ({
    id: d.id, familyId, name: d.name, kind: d.kind, room: d.room, state: d.state, reading: d.reading,
    unit: d.unit ?? null, online: d.online, riskLevel: d.riskLevel, lastSync: d.lastSync,
    source: d.source, permission: d.permission, relatedEventIds: JSON.stringify(d.relatedEventIds),
  })), 14);
  await insertRows(schema.serviceProviders, mockServices.map((s) => ({
    id: s.id, familyId, name: s.name, category: s.category, verified: s.verified, coverage: s.coverage,
    contact: s.contact, lastUsed: s.lastUsed, trustLevel: s.trustLevel, note: s.note,
  })), 10);
  await insertRows(schema.notifications, mockNotifications.map((n) => ({
    id: n.id, familyId, category: n.category, title: n.title, detail: n.detail, time: n.time, read: n.read, eventId: n.eventId ?? null,
  })), 8);
  await insertRows(schema.auditLogs, mockAuditLogs.map((a) => ({
    id: a.id, familyId, actor: a.actor, actorType: a.actorType, time: a.time, target: a.target,
    action: a.action, reason: a.reason, riskLevel: a.riskLevel, result: a.result,
  })), 10);
}

// ---------------------------------------------------------------------------
// 读取
// ---------------------------------------------------------------------------

export async function readProductState(familyId: string) {
  await seedFamilyIfEmpty(familyId);
  const db = getDb();
  const [familyRows, userRows, memberRows, eventRows, taskRows, authzRows, deviceRows, serviceRows, notificationRows, auditRows] = await Promise.all([
    db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1),
    db.select().from(schema.users).limit(1),
    db.select().from(schema.familyMembers).where(eq(schema.familyMembers.familyId, familyId)),
    db.select().from(schema.events).where(eq(schema.events.familyId, familyId)),
    db.select().from(schema.tasks).where(eq(schema.tasks.familyId, familyId)),
    db.select().from(schema.authorizations).where(eq(schema.authorizations.familyId, familyId)),
    db.select().from(schema.devices).where(eq(schema.devices.familyId, familyId)),
    db.select().from(schema.serviceProviders).where(eq(schema.serviceProviders.familyId, familyId)),
    db.select().from(schema.notifications).where(eq(schema.notifications.familyId, familyId)),
    db.select().from(schema.auditLogs).where(eq(schema.auditLogs.familyId, familyId)),
  ]);
  const family = familyRows[0];
  const user = userRows[0];
  if (!family || !user) throw new Error("家庭或用户数据缺失");

  return {
    family: { id: family.id, name: family.name, ownerId: family.ownerId, address: family.address, timezone: family.timezone, mode: family.mode as Family["mode"] },
    user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar, phone: user.phone } satisfies User,
    members: memberRows.map(memberRow),
    events: eventRows.map(eventRow),
    tasks: taskRows.map(taskRow),
    authorizations: authzRows.map(authzRow),
    devices: deviceRows.map(deviceRow),
    services: serviceRows.map(serviceRow),
    notifications: notificationRows.map(notificationRow),
    auditLogs: auditRows.map(auditRow),
  };
}

// ---------------------------------------------------------------------------
// 写操作（均由对应 route handler 在鉴权后调用）
// ---------------------------------------------------------------------------

export async function updateTask(familyId: string, id: string, patch: Record<string, unknown>) {
  const db = getDb();
  const allowed: Record<string, unknown> = {};
  for (const key of ["title", "description", "assignee", "creator", "priority", "status", "dueAt", "evidence", "evidenceUploadedAt", "familyConfirmedAt", "helpRequested"] as const) {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  }
  if (Object.keys(allowed).length === 0) return null;
  await db.update(schema.tasks).set(allowed).where(eq(schema.tasks.id, id));
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  return rows[0] ? taskRow(rows[0]) : null;
}

export async function updateEvent(familyId: string, id: string, patch: Record<string, unknown>) {
  const db = getDb();
  const allowed: Record<string, unknown> = {};
  for (const key of ["title", "description", "riskLevel", "status", "source", "createdAt", "updatedAt", "relatedMembers", "relatedDevices", "relatedTasks", "relatedAuthorizationId", "aiAssessment", "timeline"] as const) {
    if (patch[key] !== undefined) {
      allowed[key] = ["relatedMembers", "relatedDevices", "relatedTasks", "timeline"].includes(key) ? JSON.stringify(patch[key]) : patch[key];
    }
  }
  if (Object.keys(allowed).length === 0) return null;
  await db.update(schema.events).set(allowed).where(eq(schema.events.id, id));
  const rows = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  return rows[0] ? eventRow(rows[0]) : null;
}

export async function updateAuthorization(familyId: string, id: string, patch: Record<string, unknown>) {
  const db = getDb();
  const allowed: Record<string, unknown> = {};
  for (const key of ["policy", "status"] as const) {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  }
  if (Object.keys(allowed).length === 0) return null;
  await db.update(schema.authorizations).set(allowed).where(eq(schema.authorizations.id, id));
  const rows = await db.select().from(schema.authorizations).where(eq(schema.authorizations.id, id)).limit(1);
  return rows[0] ? authzRow(rows[0]) : null;
}

export async function findAuthorization(familyId: string, id: string) {
  const rows = await getDb().select().from(schema.authorizations).where(eq(schema.authorizations.id, id)).limit(1);
  return rows[0] ? authzRow(rows[0]) : null;
}

export async function markNotificationRead(familyId: string, id?: string) {
  const db = getDb();
  if (id) {
    await db.update(schema.notifications).set({ read: true }).where(eq(schema.notifications.id, id));
  } else {
    await db.update(schema.notifications).set({ read: true }).where(eq(schema.notifications.familyId, familyId));
  }
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.familyId, familyId));
  return rows.map(notificationRow);
}

export async function appendAudit(familyId: string, entry: Omit<AuditLog, "id">) {
  const db = getDb();
  const id = `AL${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await db.insert(schema.auditLogs).values({
    id, familyId, actor: entry.actor, actorType: entry.actorType, time: entry.time, target: entry.target,
    action: entry.action, reason: entry.reason, riskLevel: entry.riskLevel, result: entry.result,
  });
  return { ...entry, id };
}

export async function listEvents(familyId: string) {
  const rows = await getDb().select().from(schema.events).where(eq(schema.events.familyId, familyId));
  return rows.map(eventRow);
}

export async function findEvent(familyId: string, id: string) {
  const rows = await getDb().select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  return rows[0] ? eventRow(rows[0]) : null;
}

export async function listTasks(familyId: string) {
  const rows = await getDb().select().from(schema.tasks).where(eq(schema.tasks.familyId, familyId));
  return rows.map(taskRow);
}

export async function findTask(familyId: string, id: string) {
  const rows = await getDb().select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  return rows[0] ? taskRow(rows[0]) : null;
}

export async function listDevices(familyId: string) {
  const rows = await getDb().select().from(schema.devices).where(eq(schema.devices.familyId, familyId));
  return rows.map(deviceRow);
}

export async function currentFamily(familyId: string) {
  const db = getDb();
  const [familyRows, memberRows] = await Promise.all([
    db.select().from(schema.families).where(eq(schema.families.id, familyId)).limit(1),
    db.select().from(schema.familyMembers).where(eq(schema.familyMembers.familyId, familyId)),
  ]);
  const family = familyRows[0];
  if (!family) return null;
  return {
    family: { id: family.id, name: family.name, ownerId: family.ownerId, address: family.address, timezone: family.timezone, mode: family.mode as Family["mode"] },
    members: memberRows.map(memberRow),
  };
}
