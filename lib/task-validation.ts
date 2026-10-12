import type { Task } from "./product-models";
import { canCompleteTask } from "./product-policy.ts";
import { ProductInputError } from "./product-input.ts";

const editable = new Set([
  "version",
  "title",
  "description",
  "assignee",
  "priority",
  "status",
  "dueAt",
  "evidence",
  "evidenceUploadedAt",
  "familyConfirmedAt",
  "helpRequested",
]);
const statuses = new Set([
  "to_receive",
  "in_progress",
  "waiting_confirmation",
  "completed",
  "overdue",
]);
const priorities = new Set(["low", "medium", "high", "urgent"]);

export function validateTaskPatch(
  current: Task,
  input: unknown,
  timestamp: string,
): Partial<Task> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProductInputError("任务修改内容必须是对象");
  const body = input as Record<string, unknown>;
  if (
    body.version !== undefined &&
    (!Number.isInteger(body.version) || body.version !== (current.version ?? 0))
  )
    throw new ProductInputError("任务已更新，请重新加载后核对处理记录", 409);
  if (
    !Object.keys(body).length ||
    Object.keys(body).some((key) => !editable.has(key))
  )
    throw new ProductInputError("包含不支持的任务字段");
  if (current.status === "completed")
    throw new ProductInputError("任务已完成，不能重复修改或确认", 409);
  const patch: Partial<Task> = {};
  for (const key of ["title", "description", "assignee", "evidence"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string" || (body[key] as string).length > 4000)
      throw new ProductInputError(`${key} 格式不正确`);
    const value = (body[key] as string).trim();
    if ((key === "title" || key === "assignee" || key === "evidence") && !value)
      throw new ProductInputError("任务名称、负责人和处理记录不能留空");
    patch[key] = value;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !statuses.has(body.status))
      throw new ProductInputError("无效的任务状态");
    patch.status = body.status as Task["status"];
  }
  if (body.priority !== undefined) {
    if (typeof body.priority !== "string" || !priorities.has(body.priority))
      throw new ProductInputError("无效的任务优先级");
    patch.priority = body.priority as Task["priority"];
  }
  if (body.dueAt !== undefined) {
    if (
      typeof body.dueAt !== "string" ||
      !Number.isFinite(Date.parse(body.dueAt))
    )
      throw new ProductInputError("无效的截止时间");
    patch.dueAt = body.dueAt;
  }
  if (body.helpRequested !== undefined) {
    if (typeof body.helpRequested !== "boolean")
      throw new ProductInputError("无效的求助状态");
    patch.helpRequested = body.helpRequested;
  }
  if (patch.status === "completed") {
    if (!canCompleteTask(current))
      throw new ProductInputError("请先保存处理记录，再确认完成", 409);
    if (patch.evidence !== undefined && patch.evidence !== current.evidence)
      throw new ProductInputError("处理记录有变化，请先保存，再确认完成", 409);
    patch.familyConfirmedAt = timestamp;
    patch.helpRequested = false;
  } else if (patch.evidence !== undefined) {
    patch.evidenceUploadedAt = timestamp;
    patch.status = "waiting_confirmation";
  }
  // Timestamps are assigned by the server; clients cannot forge the confirmation time.
  if (patch.assignee !== undefined && patch.assignee !== current.assignee)
    patch.helpRequested = false;
  if (!Object.keys(patch).length)
    throw new ProductInputError("没有可保存的任务修改");
  return patch;
}
