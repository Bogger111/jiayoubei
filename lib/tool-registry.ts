import type { ToolName } from "./contracts";
import { listToolRuns, saveToolRun } from "./memory-store";
import { executeDeviceAction, getSmartHomeSnapshot } from "./smart-home";

const allowedTools: ToolName[] = ["create_task", "set_timeout", "update_event_status", "write_audit_log", "read_device_state", "control_device"];

export async function executeTool(tool: ToolName, input: Record<string, unknown>) {
  if (!allowedTools.includes(tool)) throw new Error("unknown tool");
  let status: "success" | "blocked" | "failed" = "success";
  let output: Record<string, unknown>;

  if (tool === "create_task") {
    output = {
      taskId: `TASK-${Date.now().toString(36).toUpperCase()}`,
      title: String(input.title ?? "家庭协同任务"),
      assignee: String(input.assignee ?? "小林"),
      state: "created",
    };
  } else if (tool === "set_timeout") {
    const minutes = Math.max(1, Math.min(120, Number(input.minutes) || 10));
    output = { timerId: `TIMER-${Date.now().toString(36).toUpperCase()}`, minutes, dueAt: new Date(Date.now() + minutes * 60_000).toISOString(), state: "scheduled" };
  } else if (tool === "update_event_status") {
    output = { eventId: String(input.eventId ?? "JYB-20260731-001"), state: String(input.state ?? "in_progress"), updatedAt: new Date().toISOString() };
  } else if (tool === "write_audit_log") {
    output = { auditId: `AUDIT-${Date.now().toString(36).toUpperCase()}`, actor: String(input.actor ?? "家庭管理员"), recorded: true };
  } else if (tool === "read_device_state") {
    const snapshot = await getSmartHomeSnapshot();
    output = { driver: snapshot.driver, devices: snapshot.devices, warning: snapshot.warning };
  } else {
    const deviceResult = await executeDeviceAction({
      action: String(input.action ?? ""),
      entityId: typeof input.entityId === "string" ? input.entityId : undefined,
      message: typeof input.message === "string" ? input.message : undefined,
      confirmed: input.confirmed === true,
    });
    status = deviceResult.status;
    output = deviceResult;
  }

  const stored = await saveToolRun(tool, status, input, output);
  return { id: stored?.id ?? 0, tool, status, input, output, createdAt: stored?.createdAt ?? new Date().toISOString() };
}

export async function recentToolRuns() {
  const rows = await listToolRuns(30) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row.id),
    tool: String(row.tool),
    status: String(row.status),
    input: JSON.parse(String(row.inputJson ?? "{}")),
    output: JSON.parse(String(row.outputJson ?? "{}")),
    createdAt: String(row.createdAt),
  }));
}
