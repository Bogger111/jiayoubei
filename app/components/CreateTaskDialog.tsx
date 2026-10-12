"use client";
import { useState } from "react";
import { productStore, useProductStore } from "@/lib/product-store";
import { priorityLabel, type TaskPriority } from "@/lib/product-models";
import Dialog from "./Dialog";
import { Button } from "./ui";
import { currentMember } from "@/lib/current-member";

export default function CreateTaskDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const state = useProductStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState(
    currentMember(state.members, state.user, state.demoMode)?.id ??
      state.members[0]?.id ??
      "",
  );
  const [sourceEventId, setSourceEventId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [minutes, setMinutes] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Dialog title="新建家庭任务" onClose={close} busy={busy}>
      <p>明确要做什么、由谁负责，以及何时完成。</p>
      <form
        className="task-create-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const id = await productStore.addTask({
              title,
              description,
              assignee,
              sourceEventId,
              priority,
              dueAt: new Date(
                Date.now() + Number(minutes) * 60_000,
              ).toISOString(),
            });
            onCreated(id);
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "任务未保存，请重试",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          任务标题
          <input
            required
            maxLength={200}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：电话核实家人的近况"
          />
        </label>
        <label>
          处理说明
          <textarea
            maxLength={4000}
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="需要核实的内容与完成要求（选填）"
          />
        </label>
        <label>
          负责人
          <select
            required
            value={assignee}
            disabled={busy}
            onChange={(event) => setAssignee(event.target.value)}
          >
            {state.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <div className="task-create-columns">
          <label>
            优先级
            <select
              value={priority}
              disabled={busy}
              onChange={(event) =>
                setPriority(event.target.value as TaskPriority)
              }
            >
              {Object.entries(priorityLabel).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            完成期限
            <select
              value={minutes}
              disabled={busy}
              onChange={(event) => setMinutes(event.target.value)}
            >
              <option value="15">15 分钟内</option>
              <option value="60">1 小时内</option>
              <option value="360">6 小时内</option>
              <option value="1440">24 小时内</option>
            </select>
          </label>
        </div>
        <label>
          来源事件
          <select
            value={sourceEventId}
            disabled={busy}
            onChange={(event) => setSourceEventId(event.target.value)}
          >
            <option value="">独立任务</option>
            {state.events
              .filter((event) => !["resolved", "closed"].includes(event.status))
              .map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="quiet" disabled={busy} onClick={close}>
            取消
          </Button>
          <Button type="submit" disabled={busy || !title.trim() || !assignee}>
            {busy ? "正在保存…" : "创建任务"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
