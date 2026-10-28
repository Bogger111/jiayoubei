import type { ProductState } from "@/lib/product-models";

export type ProductBootstrap = Pick<
  ProductState,
  | "family"
  | "user"
  | "members"
  | "events"
  | "tasks"
  | "authorizations"
  | "devices"
  | "services"
  | "notifications"
  | "auditLogs"
  | "carePlan"
>;

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const texts = (row: Row, fields: string[]) =>
  fields.every((key) => typeof row[key] === "string");
const optionalText = (row: Row, fields: string[]) =>
  fields.every((key) => row[key] === undefined || typeof row[key] === "string");
const choices = (value: unknown, values: string[]) =>
  typeof value === "string" && values.includes(value);
const stringList = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const risk = (value: unknown) =>
  choices(value, ["normal", "attention", "warning", "critical"]);
const row = (value: unknown): value is Row =>
  object(value) && typeof value.id === "string" && Boolean(value.id.trim());
const timeline = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      row(item) &&
      texts(item, ["time", "title", "detail", "actor"]) &&
      choices(item.tone, ["info", "success", "warning", "critical"]),
  );

const guards: Record<string, (value: unknown) => boolean> = {
  members: (value) =>
    row(value) &&
    texts(value, ["name", "relation", "role", "avatar", "location", "phone"]) &&
    typeof value.online === "boolean" &&
    typeof value.emergencyContact === "boolean" &&
    stringList(value.permissions) &&
    optionalText(value, ["currentTaskId", "userId", "accountRole"]),
  events: (value) =>
    row(value) &&
    texts(value, [
      "title",
      "description",
      "source",
      "createdAt",
      "updatedAt",
      "aiAssessment",
    ]) &&
    risk(value.riskLevel) &&
    choices(value.status, [
      "monitoring",
      "pending_confirmation",
      "processing",
      "resolved",
      "closed",
    ]) &&
    ["relatedMembers", "relatedDevices", "relatedTasks"].every((key) =>
      stringList(value[key]),
    ) &&
    optionalText(value, ["relatedAuthorizationId"]) &&
    timeline(value.timeline),
  tasks: (value) =>
    row(value) &&
    texts(value, [
      "title",
      "description",
      "assignee",
      "creator",
      "sourceEventId",
      "dueAt",
    ]) &&
    choices(value.priority, ["low", "medium", "high", "urgent"]) &&
    choices(value.status, [
      "to_receive",
      "in_progress",
      "waiting_confirmation",
      "completed",
      "overdue",
      "cancelled",
    ]) &&
    optionalText(value, [
      "evidence",
      "evidenceUploadedAt",
      "familyConfirmedAt",
    ]) &&
    (value.helpRequested === undefined ||
      typeof value.helpRequested === "boolean") &&
    (value.version === undefined ||
      (Number.isInteger(value.version) && Number(value.version) >= 0)),
  authorizations: (value) =>
    row(value) &&
    texts(value, [
      "action",
      "resource",
      "requester",
      "reason",
      "createdAt",
      "consequence",
    ]) &&
    risk(value.riskLevel) &&
    choices(value.policy, ["always_allow", "ask_every_time", "always_deny"]) &&
    choices(value.status, ["pending", "approved", "rejected", "active"]) &&
    optionalText(value, ["eventId"]),
  devices: (value) =>
    row(value) &&
    texts(value, [
      "name",
      "room",
      "state",
      "reading",
      "lastSync",
      "permission",
    ]) &&
    choices(value.kind, [
      "security",
      "environment",
      "lighting",
      "lock",
      "camera",
      "health",
      "other",
    ]) &&
    choices(value.source, ["real", "local", "simulator"]) &&
    risk(value.riskLevel) &&
    typeof value.online === "boolean" &&
    stringList(value.relatedEventIds) &&
    optionalText(value, ["unit"]),
  services: (value) =>
    row(value) &&
    texts(value, [
      "name",
      "category",
      "coverage",
      "contact",
      "lastUsed",
      "note",
    ]) &&
    typeof value.verified === "boolean" &&
    choices(value.trustLevel, ["high", "medium", "unverified"]),
  notifications: (value) =>
    row(value) &&
    texts(value, ["title", "detail", "time"]) &&
    choices(value.category, ["urgent", "action", "family", "system"]) &&
    typeof value.read === "boolean" &&
    optionalText(value, ["eventId", "taskId"]),
  auditLogs: (value) =>
    row(value) &&
    texts(value, ["actor", "time", "target", "action", "reason"]) &&
    choices(value.actorType, ["ai", "user", "device", "rule"]) &&
    risk(value.riskLevel) &&
    choices(value.result, ["success", "blocked", "failed"]),
};

export function validateProductBootstrap(
  value: unknown,
): value is ProductBootstrap {
  if (!object(value) || !row(value.family) || !row(value.user)) return false;
  if (
    !texts(value.family, ["name", "ownerId", "address", "timezone"]) ||
    !choices(value.family.mode, ["mock", "real"]) ||
    !texts(value.user, ["name", "role", "avatar", "phone"])
  )
    return false;
  try {
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: String(value.family.timezone),
    });
  } catch {
    return false;
  }
  return Object.entries(guards).every(([key, guard]) => {
    const items = value[key];
    return (
      Array.isArray(items) &&
      items.every(guard) &&
      new Set(items.map((item) => item.id)).size === items.length
    );
  });
}
