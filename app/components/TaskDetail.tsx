"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleHelp,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { productStore, useProductStore } from "@/lib/product-store";
import { priorityLabel } from "@/lib/product-models";
import { AppLink, navigate } from "./navigation";
import {
  Avatar,
  Button,
  PageHeader,
  Panel,
  SectionTitle,
  StatusBadge,
} from "./ui";
import { MemberPicker } from "./MemberPicker";
import { useCurrentTime } from "./useCurrentTime";
import { isTaskOverdue } from "@/lib/task-deadline";
import { formatDateTime } from "@/lib/format-time";
import { readTaskDraft, storeTaskDraft, taskDraftKey } from "@/lib/task-drafts";
import { currentMember } from "@/lib/current-member";
import { useAsyncScope } from "./useAsyncScope";

const subscribeToBrowser = () => () => {};
const browserReady = () => true;
const serverReady = () => false;

export default function TaskDetail({
  id,
  onNotice,
}: {
  id: string;
  onNotice: (message: string) => void;
}) {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const task = state.tasks.find((item) => item.id === id);
  const current = useCurrentTime();
  const [editor, setEditor] = useState({
    notes: task?.evidence ?? "",
    version: task?.version ?? 0,
  });
  const [observedRecord, setObservedRecord] = useState({
    evidence: task?.evidence ?? "",
    version: task?.version ?? 0,
  });
  const notes = editor.notes;
  const latestEvidence = task?.evidence ?? "";
  const latestVersion = task?.version ?? 0;
  if (
    observedRecord.evidence !== latestEvidence ||
    observedRecord.version !== latestVersion
  ) {
    setObservedRecord({ evidence: latestEvidence, version: latestVersion });
    if (
      editor.notes.trim() === observedRecord.evidence.trim() ||
      editor.notes.trim() === latestEvidence.trim()
    )
      setEditor({ notes: latestEvidence, version: latestVersion });
  }
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStored, setDraftStored] = useState(false);
  const draftKey = taskDraftKey(state.user.id, state.family.id, id);
  const canReadBrowser = useSyncExternalStore(
    subscribeToBrowser,
    browserReady,
    serverReady,
  );
  if (canReadBrowser && !draftLoaded) {
    const draft = readTaskDraft(draftKey);
    if (draft) setEditor({ notes: draft.notes, version: draft.version });
    setDraftLoaded(true);
    setDraftStored(Boolean(draft));
  }
  useEffect(() => {
    if (!draftLoaded || !task) return;
    const changed = editor.notes.trim() !== (task.evidence ?? "").trim();
    if (!changed) storeTaskDraft(draftKey, undefined);
  }, [draftLoaded, draftKey, editor, task]);
  const updateDraft = (value: typeof editor) => {
    setEditor(value);
    setDraftStored(
      storeTaskDraft(
        draftKey,
        value.notes.trim() !== (task?.evidence ?? "").trim() &&
          value.notes.trim()
          ? { ...value, updatedAt: Date.now() }
          : undefined,
      ),
    );
  };
  if (!task)
    return (
      <div className="not-found">
        <h1>内容不存在</h1>
        <p>未找到任务 {id}。</p>
        <Button onClick={() => navigate("/tasks")}>返回家庭任务</Button>
      </div>
    );
  const event = state.events.find((item) => item.id === task.sourceEventId);
  const member = state.members.find((item) => item.id === task.assignee);
  const complete = task.status === "completed";
  const me = currentMember(state.members, state.user, state.demoMode);
  const takingOver = Boolean(me && me.id !== task.assignee);
  const unsaved = notes.trim() !== (task.evidence ?? "").trim();
  const newerRecord = unsaved && editor.version !== (task.version ?? 0);
  const perform = async (
    label: string,
    operation: () => Promise<boolean>,
    successMessage: string,
  ) => {
    if (busy) return;
    const stillCurrent = captureScope();
    setBusy(label);
    setError("");
    try {
      const success = await operation();
      if (!stillCurrent()) return;
      if (success) onNotice(successMessage);
      else {
        setError(
          productStore.getSnapshot().lastError ??
            "操作未保存，请检查任务状态后重试。",
        );
        productStore.clearError();
      }
    } catch (cause) {
      if (!stillCurrent()) return;
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      if (stillCurrent()) setBusy("");
    }
  };
  if (task.sourceEventId?.startsWith("CARE-")) return <><AppLink className="back-button" href="/tasks">返回家庭任务</AppLink><PageHeader eyebrow="关怀确认" title={task.title} description={task.description} action={<StatusBadge status={task.status}/>}/><Panel><h2>这是一份关怀联系安排</h2><p>请在本次关怀记录中接手，记录是否联系到，以及是否需要继续跟进。</p>{task.evidence&&<p>{task.evidence}</p>}<AppLink className="care-primary" href={state.demoMode?"/":"/care?caseId="+encodeURIComponent(task.sourceEventId)}>进入关怀确认</AppLink></Panel></>;
  return (
    <>
      <AppLink className="back-button" href="/tasks">
        <ArrowLeft size={15} />
        返回家庭任务
      </AppLink>
      <PageHeader
        eyebrow="协同执行"
        title={task.title}
        description={task.description}
        action={<StatusBadge status={task.status} />}
      />
      <div className="detail-layout">
        <div>
          <Panel className="why-panel">
            <span className="eyebrow">任务来源</span>
            <h2>{event?.title ?? "家庭协同任务"}</h2>
            <p>{event?.aiAssessment ?? "由家庭成员创建，请按任务说明处理。"}</p>
            {event && (
              <AppLink className="link-button" href={`/events/${event.id}`}>
                查看来源事件 →
              </AppLink>
            )}
          </Panel>
          <Panel>
            <SectionTitle
              title="执行进度"
              detail="处理记录保存后，才能确认完成"
            />
            <ol className="task-steps">
              <li className="done">
                <span>
                  <Check size={14} />
                </span>
                <div>
                  <strong>任务已创建</strong>
                  <small>已安排责任人与截止时间</small>
                </div>
              </li>
              <li className={task.evidence ? "done" : "current"}>
                <span>{task.evidence ? <Check size={14} /> : "2"}</span>
                <div>
                  <strong>执行并记录结果</strong>
                  <small>
                    {task.evidence
                      ? "处理记录已保存"
                      : "记录联系对象、处理过程和核实结果"}
                  </small>
                </div>
              </li>
              <li className={complete ? "done" : ""}>
                <span>{complete ? <Check size={14} /> : "3"}</span>
                <div>
                  <strong>家庭确认</strong>
                  <small>
                    {complete ? "已核对记录并确认完成" : "由家庭成员核对后确认"}
                  </small>
                </div>
              </li>
            </ol>
          </Panel>
          <Panel className="evidence-panel">
            <SectionTitle
              title="处理记录"
              detail="写下真实核实结果，让其他家人了解情况"
            />
            {complete ? (
              <>
                <p className="saved-evidence">{task.evidence}</p>
                {unsaved && notes.trim() && (
                  <details className="saved-record-compare">
                    <summary>查看未提交的草稿</summary>
                    <p>{notes}</p>
                    <small>任务已经完成，这段草稿尚未写入处理记录。</small>
                  </details>
                )}
              </>
            ) : (
              <>
                <label className="evidence-label" htmlFor="task-evidence">
                  完成证据与核实结果
                </label>
                <textarea
                  id="task-evidence"
                  name="task-evidence"
                  value={notes}
                  disabled={Boolean(busy)}
                  maxLength={4000}
                  rows={5}
                  onChange={(event) =>
                    updateDraft({
                      notes: event.target.value,
                      version: editor.version,
                    })
                  }
                  placeholder="例如：已与本人通话，确认当前状态；记录联系时间、处理人和后续安排。"
                />
                {((task.evidence && unsaved) || newerRecord) && (
                  <details className="saved-record-compare">
                    <summary>查看当前已保存的记录</summary>
                    <p>
                      {task.evidence || "尚未保存处理记录，任务安排已更新。"}
                    </p>
                    <small>修改前请核对，避免覆盖其他家人的确认结果。</small>
                    {newerRecord && (
                      <Button
                        variant="secondary"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          updateDraft({
                            ...editor,
                            version: task.version ?? 0,
                          })
                        }
                      >
                        已核对，保留我的草稿
                      </Button>
                    )}
                  </details>
                )}
                <div className="evidence-editor-foot">
                  <span>
                    {notes.length}/4000{unsaved && " · 有未保存的修改"}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={
                      Boolean(busy) || !notes.trim() || !unsaved || newerRecord
                    }
                    onClick={() =>
                      void perform(
                        "evidence",
                        () =>
                          productStore.saveTaskEvidence(
                            task.id,
                            notes,
                            editor.version,
                          ),
                        "处理记录已保存，等待家庭确认",
                      )
                    }
                  >
                    {busy === "evidence" ? "保存中…" : "保存处理记录"}
                  </Button>
                </div>
                {unsaved && notes.trim() && (
                  <p className="record-caption">
                    {draftStored
                      ? "草稿保留在当前标签页，刷新后可以继续填写；尚未提交给家人。"
                      : "草稿尚未提交，请保留当前页面以继续填写。"}
                  </p>
                )}
                {newerRecord && (
                  <p className="record-update-note" role="status">
                    任务已更新。你的草稿已保留，请展开最新记录并核对后继续保存。
                  </p>
                )}
              </>
            )}
            {task.evidenceUploadedAt && (
              <p className="record-caption">
                <Check size={13} />
                记录已保存 ·{" "}
                {new Date(task.evidenceUploadedAt).toLocaleString("zh-CN")}
              </p>
            )}
            {state.demoMode && !complete && (
              <p className="record-caption">
                演示模式：填写的内容用于验证流程，请勿把示例记录当作现场处置证据。
              </p>
            )}
          </Panel>
        </div>
        <aside className="detail-aside">
          <Panel>
            <SectionTitle title="任务负责人" />
            <div className="owner-row">
              <Avatar member={member} size="lg" />
              <div>
                <strong>{member?.name ?? "待分配"}</strong>
                <p>
                  {member?.role ?? "家庭成员"} ·{" "}
                  {member?.location ?? "位置未共享"}
                </p>
              </div>
            </div>
            <div className="mini-info">
              <span>截止时间</span>
              <strong
                className={
                  isTaskOverdue(task, current, !state.demoMode)
                    ? "deadline-late"
                    : undefined
                }
              >
                {formatDateTime(task.dueAt, state.family.timezone)}
                {isTaskOverdue(task, current, !state.demoMode) && " · 已超时"}
              </strong>
            </div>
            <div className="mini-info">
              <span>优先级</span>
              <strong>{priorityLabel[task.priority]}</strong>
            </div>
          </Panel>
          <Panel className="action-panel">
            <SectionTitle title="接下来怎么做" />
            {task.helpRequested && !complete && (
              <p className="task-help-note">
                <CircleHelp size={16} />{" "}
                家人正在请求协助，接手前请核对任务情况。
              </p>
            )}
            {complete ? (
              <div className="success-block">
                <Check size={18} />
                任务已完成并留痕
              </div>
            ) : (
              <>
                {(task.status === "to_receive" ||
                  task.status === "overdue" ||
                  (task.helpRequested && takingOver)) && (
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void perform(
                        "accept",
                        () => productStore.updateTask(task.id, "accept"),
                        takingOver
                          ? "你已接手任务，负责人已更新"
                          : "已接受任务",
                      )
                    }
                  >
                    {busy === "accept"
                      ? "保存中…"
                      : takingOver
                        ? "接手这项任务"
                        : "接受任务"}
                  </Button>
                )}
                <Button
                  disabled={Boolean(busy) || !task.evidence || unsaved}
                  onClick={() =>
                    void perform(
                      "complete",
                      () => productStore.updateTask(task.id, "complete"),
                      "已确认任务完成",
                    )
                  }
                >
                  {busy === "complete" ? "确认中…" : "确认完成"}
                </Button>
                <p className="action-hint">
                  <ShieldCheck size={14} />
                  {unsaved
                    ? "请先保存处理记录，再核对并确认。"
                    : task.evidence
                      ? "确认表示你已核对处理结果。"
                      : "先保存处理记录，再确认完成。"}
                </p>
                <Button
                  variant="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => setTransferring(true)}
                >
                  转交任务
                </Button>
                <Button
                  variant="quiet"
                  disabled={Boolean(busy) || task.helpRequested}
                  onClick={() =>
                    void perform(
                      "help",
                      () => productStore.updateTask(task.id, "help"),
                      "求助提醒已保存，家人可在通知中心查看",
                    )
                  }
                >
                  {task.helpRequested ? "已请求家庭帮助" : "请求家庭成员帮助"}
                </Button>
              </>
            )}
            {error && (
              <div className="inline-error" role="alert">
                <AlertTriangle size={15} />
                {error}
              </div>
            )}
            {complete && task.familyConfirmedAt && (
              <p className="action-hint">
                <Clock3 size={14} />
                {new Date(task.familyConfirmedAt).toLocaleString("zh-CN")}
              </p>
            )}
          </Panel>
        </aside>
      </div>
      {transferring && (
        <MemberPicker
          title="转交任务给谁？"
          members={state.members.filter((item) => item.id !== task.assignee)}
          busy={Boolean(busy)}
          onClose={() => setTransferring(false)}
          onChoose={(memberId) =>
            void perform(
              "transfer",
              async () => {
                const saved = await productStore.transferTask(
                  task.id,
                  memberId,
                );
                if (saved) setTransferring(false);
                return saved;
              },
              "任务已转交",
            )
          }
        />
      )}
    </>
  );
}
