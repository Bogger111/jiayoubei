import assert from "node:assert/strict";
import { isTaskOverdue } from "../lib/task-deadline.ts";
import test from "node:test";
import { validateTaskPatch } from "../lib/task-validation.ts";
import { taskCreateInput } from "../lib/task-create-input.ts";

const current = {
  id: "T1",
  title: "核实情况",
  description: "",
  assignee: "M1",
  creator: "家人",
  sourceEventId: "E1",
  priority: "urgent",
  status: "in_progress",
  dueAt: "2026-10-11T12:00:00Z",
};
const now = "2026-10-11T11:00:00Z";
test("expired deadlines remain visible without changing the execution status", () => {
  assert.equal(isTaskOverdue(current, Date.parse(now)), false);
  assert.equal(isTaskOverdue(current, Date.parse(current.dueAt)), true);
  assert.equal(
    isTaskOverdue(
      { ...current, status: "waiting_confirmation" },
      Date.parse(current.dueAt) + 1,
    ),
    true,
  );
  assert.equal(
    isTaskOverdue(
      { ...current, status: "completed" },
      Date.parse(current.dueAt) + 1,
    ),
    false,
  );
  assert.equal(
    isTaskOverdue({ ...current, dueAt: "unknown" }, Date.parse(now)),
    false,
  );
  assert.equal(current.status, "in_progress");
  assert.equal(
    isTaskOverdue(current, Date.parse(current.dueAt) + 1, false),
    false,
    "fixed demonstration snapshots retain their preset status",
  );
});
test("completion requires a previously saved record and server confirmation time", () => {
  assert.throws(
    () => validateTaskPatch(current, { status: "completed" }, now),
    /先保存处理记录/,
  );
  assert.throws(
    () =>
      validateTaskPatch(
        current,
        { evidence: "刚刚联系确认", status: "completed" },
        now,
      ),
    /先保存处理记录/,
  );
  const saved = { ...current, evidence: "已电话联系本人，确认状态正常。" };
  assert.equal(
    validateTaskPatch(
      saved,
      { status: "completed", familyConfirmedAt: "1900-01-01" },
      now,
    ).familyConfirmedAt,
    now,
  );
  assert.throws(
    () =>
      validateTaskPatch(
        saved,
        { status: "completed", evidence: "不同的记录" },
        now,
      ),
    /先保存/,
  );
});
test("saving evidence keeps the task open for family confirmation", () => {
  const patch = validateTaskPatch(
    current,
    { evidence: "  已联系本人并核实安全  ", evidenceUploadedAt: "1900-01-01" },
    now,
  );
  assert.deepEqual(patch, {
    evidence: "已联系本人并核实安全",
    status: "waiting_confirmation",
    evidenceUploadedAt: now,
  });
});
test("help remains pending until a different member takes over or the task completes", () => {
  const waiting = {
    ...current,
    helpRequested: true,
    evidence: "已完成电话核实",
  };
  assert.equal(
    validateTaskPatch(waiting, { assignee: "M2", status: "in_progress" }, now)
      .helpRequested,
    false,
  );
  assert.equal(
    validateTaskPatch(waiting, { assignee: "M1", status: "in_progress" }, now)
      .helpRequested,
    undefined,
  );
  assert.equal(
    validateTaskPatch(waiting, { status: "completed" }, now).helpRequested,
    false,
  );
});
test("invalid fields and malformed values cannot enter stored tasks", () => {
  for (const body of [
    null,
    [],
    {},
    { familyId: "OTHER" },
    { status: "done" },
    { priority: "critical" },
    { dueAt: "tomorrow" },
    { helpRequested: "yes" },
    { evidence: "  " },
    { assignee: 7 },
  ])
    assert.throws(() => validateTaskPatch(current, body, now));
  assert.throws(
    () =>
      validateTaskPatch(
        { ...current, status: "completed", evidence: "已核实" },
        { status: "in_progress" },
        now,
      ),
    /任务已完成/,
  );
});
test("new task input cannot inject completion, ownership or expired deadlines", () => {
  const input = { title: "核实情况", assignee: "M1" };
  for (const extra of [
    { familyId: "OTHER" },
    { status: "completed" },
    { evidence: "已核实" },
    { priority: "critical" },
    { dueAt: "1900-01-01" },
  ])
    assert.throws(() => taskCreateInput({ ...input, ...extra }));
  assert.equal(taskCreateInput(input).priority, "medium");
});
test("outdated task versions cannot overwrite another member's saved record", () => {
  const updated = { ...current, version: 2, evidence: "家人已核实并保存" };
  assert.throws(
    () =>
      validateTaskPatch(
        updated,
        { evidence: "旧页面里的草稿", version: 1 },
        now,
      ),
    /任务已更新/,
  );
  assert.equal(
    validateTaskPatch(
      updated,
      { evidence: "核对后补充的记录", version: 2 },
      now,
    ).evidence,
    "核对后补充的记录",
  );
});
