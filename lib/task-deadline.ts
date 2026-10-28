import type { Task } from "./product-models";

/** A deadline indicator is separate from the saved execution status. */
export function isTaskOverdue(
  task: Pick<Task, "status" | "dueAt">,
  current: number,
  observeDeadline = true,
) {
  if (task.status === "completed" || task.status === "cancelled") return false;
  if (task.status === "overdue") return true;
  if (!observeDeadline) return false;
  const deadline = Date.parse(task.dueAt);
  return current > 0 && Number.isFinite(deadline) && deadline <= current;
}
