import { ProductInputError } from "./product-input.ts";
import type { TaskPriority } from "./product-models.ts";

export function taskCreateInput(
  input: Record<string, unknown>,
  now = Date.now(),
) {
  const text = (
    value: unknown,
    label: string,
    required = false,
    limit = 200,
  ) => {
    if (!required && value === undefined) return "";
    if (
      typeof value !== "string" ||
      value.length > limit ||
      (required && !value.trim())
    )
      throw new ProductInputError(`请填写有效的${label}`);
    return value.trim();
  };
  for (const key of Object.keys(input))
    if (
      ![
        "title",
        "description",
        "assignee",
        "sourceEventId",
        "priority",
        "dueAt",
      ].includes(key)
    )
      throw new ProductInputError(`不支持的任务字段：${key}`);
  const priority = input.priority ?? "medium";
  if (!["low", "medium", "high", "urgent"].includes(String(priority)))
    throw new ProductInputError("任务优先级不正确");
  const due =
    input.dueAt === undefined
      ? now + 30 * 60_000
      : Date.parse(text(input.dueAt, "截止时间", true, 50));
  if (!Number.isFinite(due) || due <= now || due > now + 366 * 24 * 60 * 60_000)
    throw new ProductInputError("截止时间应在未来一年内");
  return {
    title: text(input.title, "任务标题", true),
    description: text(input.description, "任务描述", false, 4000),
    assignee: text(input.assignee, "负责人", true),
    sourceEventId: text(input.sourceEventId, "来源事件"),
    priority: priority as TaskPriority,
    dueAt: new Date(due).toISOString(),
  };
}
