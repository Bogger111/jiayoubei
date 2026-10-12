import type { ToolName } from "./contracts";
import { listToolRuns, saveToolRun } from "./memory-store";
import { getFamilyDeviceSnapshot } from "./server/device-snapshot";
import { controlFamilyDevice } from "./server/device-control";
import { appendAudit, updateEvent } from "./server/product-repo";
import { inputText } from "./server/request-body";
import type { SessionUser } from "./server/session";
import { ProductInputError } from "./product-input";
import { createFamilyTask } from "./server/task-create";

const allowedTools: ToolName[] = [
  "create_task",
  "set_timeout",
  "update_event_status",
  "write_audit_log",
  "read_device_state",
  "control_device",
];
export async function executeTool(
  user: SessionUser,
  tool: ToolName,
  input: Record<string, unknown>,
) {
  if (!allowedTools.includes(tool)) throw new ProductInputError("工具不受支持");
  let status: "success" | "blocked" | "failed" = "success";
  let output: Record<string, unknown>;
  if (tool === "read_device_state") {
    output = await getFamilyDeviceSnapshot(user.familyId);
  } else if (tool === "control_device") {
    const result = await controlFamilyDevice(
      user,
      inputText(input.entityId, "设备标识", 200),
      input,
    );
    status = result.status;
    output = result;
  } else if (tool === "set_timeout") {
    status = "blocked";
    output = {
      reason: "后台定时任务尚未启用，请通过家庭任务的截止时间安排跟进。",
      scheduled: false,
    };
  } else if (tool === "write_audit_log") {
    const action = inputText(input.action, "记录动作", 200);
    const target = inputText(input.target, "记录对象", 200);
    await appendAudit(user.familyId, {
      actor: user.name,
      actorType: "user",
      time: new Date().toISOString(),
      target,
      action,
      reason: inputText(input.reason, "记录说明", 1000, true),
      riskLevel: "normal",
      result: "success",
    });
    output = { recorded: true };
  } else if (tool === "update_event_status") {
    const eventId = inputText(input.eventId, "事件标识", 200);
    const event = await updateEvent(
      user.familyId,
      eventId,
      { status: input.state },
      user.name,
    );
    if (!event) throw new ProductInputError("事件不存在", 404);
    output = { eventId, state: event.status, updatedAt: event.updatedAt };
  } else {
    const title = inputText(input.title, "任务标题", 200);
    const assignee = inputText(input.assignee, "责任人标识", 200);
    const eventId = inputText(input.eventId, "事件标识", 200, true);
    const created = await createFamilyTask(user, {
      title,
      assignee,
      description: input.description,
      sourceEventId: eventId,
    });
    output = { taskId: created.id, title, assignee, state: "created" };
  }
  const stored = await saveToolRun(user.familyId, tool, status, input, output);
  return {
    id: stored?.id ?? 0,
    tool,
    status,
    input,
    output,
    createdAt: stored?.createdAt ?? new Date().toISOString(),
  };
}
export async function recentToolRuns(familyId: string) {
  const rows = (await listToolRuns(familyId, 30)) as Array<
    Record<string, unknown>
  >;
  return rows.map((row) => ({
    id: Number(row.id),
    tool: String(row.tool),
    status: String(row.status),
    input: JSON.parse(String(row.inputJson ?? "{}")),
    output: JSON.parse(String(row.outputJson ?? "{}")),
    createdAt: String(row.createdAt),
  }));
}
