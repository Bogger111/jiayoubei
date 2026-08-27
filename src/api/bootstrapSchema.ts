import type { ProductState } from "@/lib/product-models";

export type ProductBootstrap = Pick<ProductState,
  "family" | "user" | "members" | "events" | "tasks" | "authorizations" | "devices" |
  "services" | "notifications" | "auditLogs"
>;

const collectionKeys = ["members", "events", "tasks", "authorizations", "devices", "services", "notifications", "auditLogs"] as const;

export function validateProductBootstrap(value: unknown): value is ProductBootstrap {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!record.family || typeof record.family !== "object") return false;
  if (!record.user || typeof record.user !== "object") return false;
  return collectionKeys.every((key) => Array.isArray(record[key]));
}
