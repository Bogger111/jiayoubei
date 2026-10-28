"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import CvFallMonitor from "./CvFallMonitor";
import AppShell from "./components/QuietShell";
import Dashboard from "./components/CareHome";
import FamilyMemory from "./components/FamilyMemory";
import CareWorkspace from "./components/CareWorkspace";
import TaskDetail from "./components/TaskDetail";
import EventDetail from "./components/EventDetail";
import DeviceDetail from "./components/DeviceDetail";
import SettingsPage from "./components/SettingsPage";
import Dialog from "./components/Dialog";
import CreateTaskDialog from "./components/CreateTaskDialog";
import InviteMemberDialog from "./components/InviteMemberDialog";
import RevokeMemberAccessDialog from "./components/RevokeMemberAccessDialog";
import JoinFamilyPage from "./components/JoinFamilyPage";
import { useRealAuthMode } from "./components/useRealAuthMode";
import { useAppearance } from "./components/useAppearance";
import { useSessionSync } from "./components/useSessionSync";
import { useAsyncScope } from "./components/useAsyncScope";
import { currentMember as findCurrentMember } from "@/lib/current-member";
import { buildAuditCsv } from "@/lib/audit-export";
import { recordTargetIndex, resolveRecordTarget } from "@/lib/record-target";
import { apiRequest, ApiError } from "@/src/api/apiClient";
import { formatTime, formatDateTime, matchesDay } from "@/lib/format-time";
import { isTaskOverdue } from "@/lib/task-deadline";
import { useCurrentTime } from "./components/useCurrentTime";
import { AppLink, navigate, usePath } from "./components/navigation";
import { useDialogFocusTrap } from "./components/useDialogFocus";
import { useSpeechInput } from "./components/useSpeechInput";
import {
  Icon,
  RiskBadge,
  StatusBadge,
  Avatar,
  Button,
  PageHeader,
  Panel,
  SectionTitle,
  EmptyState,
  LoadingSkeleton,
  Toast,
  EventCard,
  Metric,
} from "./components/ui";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  DoorOpen,
  Home,
  LockKeyhole,
  Mic,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import type {
  Authorization,
  Device,
  Event,
  FamilyMember,
  RiskLevel,
  Task,
} from "@/src/models";
import { policyLabel, priorityLabel, riskLabel } from "@/src/models";
import { productStore, useProductStore } from "@/src/stores/productStore";
import { isAuthorizationPolicyAllowed } from "@/lib/product-policy";
import { authApi } from "@/src/api/authApi";

function EventsPage() {
  const state = useProductStore();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const list = state.events.filter(
    (e) =>
      (filter === "all" || e.status === filter || e.riskLevel === filter) &&
      `${e.title}${e.description}${e.relatedMembers.map((id) => state.members.find((m) => m.id === id)?.name ?? "").join("")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="持续跟进"
        title="事件中心"
        description="事件不是通知，而是一条从识别到解决的协同链路。"
        action={
          <Button onClick={() => navigate("/ai")}>
            <Plus size={16} /> 创建事件
          </Button>
        }
      />
      <Panel className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            name="event-search"
            aria-label="搜索事件标题或成员"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索事件标题或成员…"
          />
        </div>
        <div className="filter-tabs">
          {[
            ["all", "全部"],
            ["pending_confirmation", "待确认"],
            ["processing", "处理中"],
            ["resolved", "已解决"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
              <small>
                {key === "all"
                  ? state.events.length
                  : state.events.filter((e) => e.status === key).length}
              </small>
            </button>
          ))}
        </div>
      </Panel>
      <div className="event-grid">
        {list.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            members={state.members}
            onClick={() => navigate(`/events/${e.id}`)}
          />
        ))}
        {list.length === 0 && (
          <Panel className="event-empty">
            <EmptyState
              title="没有匹配的事件"
              detail="尝试其他关键词或切换事件状态。"
            />
          </Panel>
        )}
      </div>
    </>
  );
}

function TasksPage() {
  const state = useProductStore();
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const currentMember = findCurrentMember(
    state.members,
    state.user,
    state.demoMode,
  );
  const list = state.tasks.filter(
    (t) =>
      tab === "all" ||
      (tab === "mine"
        ? t.assignee === currentMember?.id
        : tab === "help"
          ? t.helpRequested && !["completed", "cancelled"].includes(t.status)
          : tab === "ai"
            ? t.creator.includes("AI") || t.creator.includes("规则")
            : t.status === "completed"),
  );
  return (
    <>
      <PageHeader
        eyebrow="协同执行"
        title="家庭任务"
        description="每个异常都有责任人、截止时间和完成证据。"
        action={
          <Button
            disabled={
              Boolean(state.busy) ||
              !["家庭管理员", "admin"].includes(state.user.role)
            }
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} /> 新建任务
          </Button>
        }
      />
      <div className="segmented">
        {[
          ["all", "全部任务"],
          ["mine", "我的任务"],
          ["help", "需要协助"],
          ["ai", "分析建议"],
          ["completed", "已完成"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <Panel className="table-panel">
        <div className="task-table-head">
          <span>任务</span>
          <span>负责人</span>
          <span>来源事件</span>
          <span>优先级</span>
          <span>状态</span>
          <span />
        </div>
        {list.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            members={state.members}
            events={state.events}
          />
        ))}
        {list.length === 0 && (
          <EmptyState
            title="当前没有匹配的任务"
            detail="切换任务分类，或描述家庭情况来创建任务。"
          />
        )}
      </Panel>
      {createOpen && (
        <CreateTaskDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            navigate(`/tasks/${id}`);
          }}
        />
      )}
    </>
  );
}
function TaskRow({
  task,
  members,
  events,
}: {
  task: Task;
  members: FamilyMember[];
  events: Event[];
}) {
  const member = members.find((m) => m.id === task.assignee);
  const source = events.find((event) => event.id === task.sourceEventId);
  const { demoMode } = useProductStore();
  const overdue = isTaskOverdue(task, useCurrentTime(), !demoMode);
  return (
    <button className="task-row" onClick={() => navigate(`/tasks/${task.id}`)}>
      <span className="task-name">
        <span className={`mini-icon ${overdue ? "rose" : ""}`}>
          <Check size={14} />
        </span>
        <span>
          <strong>{task.title}</strong>
          {task.helpRequested && !["completed", "cancelled"].includes(task.status) && (
            <em className="task-help-badge">需要协助</em>
          )}
          <small className={overdue ? "deadline-late" : undefined}>
            {overdue ? "已超时 · " : ""}截止 {formatDateTime(task.dueAt)}
          </small>
        </span>
      </span>
      <span className="assignee">
        <Avatar member={member} size="sm" />
        {member?.name}
      </span>
      <span
        className="muted task-source"
        title={source?.title ?? task.sourceEventId}
      >
        {source?.title ?? (task.sourceEventId ? "来源事件" : "独立任务")}
      </span>
      <span className={`priority priority-${task.priority}`}>
        {priorityLabel[task.priority]}
      </span>
      <StatusBadge status={task.status} />
      <ChevronRight size={16} />
    </button>
  );
}
function AuthorizationsPage() {
  const state = useProductStore();
  const [selectedId, setSelectedId] = useState<string | null>(
    state.authorizations.find((a) => a.status === "pending")?.id ?? null,
  );
  const [tab, setTab] = useState<"pending" | "rules" | "history">("pending");
  const pending = state.authorizations.filter((a) => a.status === "pending");
  const history = state.authorizations.filter(
    (a) => a.status === "approved" || a.status === "rejected",
  );
  const selected = state.authorizations.find(
    (authorization) => authorization.id === selectedId,
  );
  return (
    <>
      <PageHeader
        eyebrow="安全边界"
        title="授权中心"
        description="AI 想做什么、为什么要做、会产生什么后果，都由你决定。"
        action={
          <div className="policy-summary">
            <ShieldCheck size={18} />
            <span>
              <strong>{pending.length}</strong> 项待确认
            </span>
          </div>
        }
      />
      <Panel className="principle-banner">
        <div className="principle-icon">
          <ShieldCheck size={23} />
        </div>
        <div>
          <strong>AI 负责理解与规划，规则负责边界，人工负责关键确认。</strong>
          <p>
            门锁、摄像头、敏感隐私共享和专业救援等动作不能通过默认授权静默执行。
          </p>
        </div>
      </Panel>
      <div className="segmented auth-tabs">
        <button
          className={tab === "pending" ? "active" : ""}
          onClick={() => setTab("pending")}
        >
          待确认 <small>{pending.length}</small>
        </button>
        <button
          className={tab === "rules" ? "active" : ""}
          onClick={() => setTab("rules")}
        >
          我的规则
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          历史授权 <small>{history.length}</small>
        </button>
      </div>
      <div className="auth-layout">
        <div>
          {tab === "pending" && (
            <>
              <SectionTitle
                title="待确认"
                detail="高风险操作会在这里等待你的决定"
              />
              {pending.map((a) => (
                <AuthorizationCard
                  key={a.id}
                  auth={a}
                  onClick={() => setSelectedId(a.id)}
                />
              ))}
              {pending.length === 0 && (
                <Panel>
                  <EmptyState
                    title="暂无待确认授权"
                    detail="当前没有需要你立即决定的高风险动作。"
                  />
                </Panel>
              )}
            </>
          )}
          {tab === "rules" && (
            <>
              <SectionTitle title="我的规则" detail="长期规则可以随时修改" />
              <div className="rules-list">
                {state.authorizations
                  .filter((a) => a.status === "active")
                  .map((a) => (
                    <RuleRow key={a.id} auth={a} />
                  ))}
              </div>
            </>
          )}
          {tab === "history" && (
            <>
              <SectionTitle title="历史授权" detail="每次人工决定都可追溯" />
              <div className="rules-list">
                {history.map((a) => (
                  <AuthorizationHistoryRow key={a.id} auth={a} />
                ))}
              </div>
            </>
          )}
        </div>
        <aside className="auth-side">
          <Panel>
            <SectionTitle title="四级风险" />
            <div className="risk-legend">
              {(
                ["normal", "attention", "warning", "critical"] as RiskLevel[]
              ).map((r) => (
                <div key={r}>
                  <RiskBadge level={r} />
                  <p>
                    {r === "normal"
                      ? "读取低敏状态"
                      : r === "attention"
                        ? "创建任务与发送提醒"
                        : r === "warning"
                          ? "影响家庭安全的动作"
                          : "门锁、摄像头、专业救援"}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="policy-card">
            <LockKeyhole size={19} />
            <h3>门锁永远需要人工确认</h3>
            <p>
              即使 AI
              建议开门，也会先经过风险规则，再进入确认弹窗，不会直接调用设备。
            </p>
            <button
              className="link-button"
              onClick={() => navigate("/events/E002")}
            >
              查看陌生访客事件 <ArrowRight size={14} />
            </button>
          </Panel>
        </aside>
      </div>
      {selected && (
        <RiskConfirmDialog
          auth={selected}
          onClose={() => setSelectedId(null)}
          onEditRules={() => {
            setSelectedId(null);
            setTab("rules");
          }}
        />
      )}
    </>
  );
}
function AuthorizationCard({
  auth,
  onClick,
}: {
  auth: Authorization;
  onClick: () => void;
}) {
  return (
    <button className="authorization-card" onClick={onClick}>
      <div className="auth-card-icon">
        <LockKeyhole size={20} />
      </div>
      <div className="auth-card-content">
        <div className="card-top">
          <RiskBadge level={auth.riskLevel} />
          <span>{formatTime(auth.createdAt)}</span>
        </div>
        <h3>{auth.action}</h3>
        <p>{auth.reason}</p>
        <div className="auth-resource">
          <span>资源</span>
          {auth.resource}
          <ChevronRight size={15} />
        </div>
      </div>
    </button>
  );
}
function RuleRow({ auth }: { auth: Authorization }) {
  const captureScope = useAsyncScope();
  const allowedPolicies = Object.entries(policyLabel).filter(([key]) =>
    isAuthorizationPolicyAllowed(auth, key as Authorization["policy"]),
  );
  const change = async (value: Authorization["policy"]) => {
    const stillCurrent = captureScope();
    const saved = await productStore.setAuthorizationPolicy(auth.id, value);
    if (stillCurrent() && !saved)
      notifyGlobal("授权规则未保存，请检查权限与服务状态");
  };
  return (
    <div className="rule-row">
      <div className="rule-icon">
        <ShieldCheck size={17} />
      </div>
      <div>
        <strong>{auth.action}</strong>
        <p>
          {auth.resource} · {riskLabel[auth.riskLevel]}
        </p>
        {auth.riskLevel === "critical" && (
          <small className="critical-rule-note">
            安全规则：仅支持每次询问或始终拒绝
          </small>
        )}
      </div>
      <select
        aria-label={`${auth.action}授权规则`}
        value={auth.policy}
        onChange={(e) => change(e.target.value as Authorization["policy"])}
      >
        {allowedPolicies.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
function AuthorizationHistoryRow({ auth }: { auth: Authorization }) {
  const approved = auth.status === "approved";
  return (
    <button
      className="history-auth-row"
      onClick={() => auth.eventId && navigate(`/events/${auth.eventId}`)}
    >
      <span className={`history-result ${approved ? "approved" : "rejected"}`}>
        {approved ? <Check size={15} /> : <X size={15} />}
      </span>
      <span>
        <strong>{auth.action}</strong>
        <p>
          {auth.resource} · {auth.reason}
        </p>
      </span>
      <span>
        <RiskBadge level={auth.riskLevel} />
        <small>{approved ? "已允许" : "已拒绝"}</small>
      </span>
      <ChevronRight size={15} />
    </button>
  );
}
function RiskConfirmDialog({
  auth,
  onClose,
  onEditRules,
}: {
  auth: Authorization;
  onClose: () => void;
  onEditRules: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) onClose();
  };
  const dialogRef = useDialogFocusTrap(close);
  const captureScope = useAsyncScope();
  const decide = async (d: "approve" | "reject") => {
    const stillCurrent = captureScope();
    setBusy(true);
    const success = await productStore.confirmAuthorization(auth.id, d);
    if (!stillCurrent()) return;
    setBusy(false);
    if (success) onClose();
    else notifyGlobal("授权提交失败，设备未执行任何动作");
  };
  return (
    <div className="dialog-backdrop" role="presentation" onClick={close}>
      <div
        ref={dialogRef}
        className="risk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${auth.action}授权确认`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="dialog-close"
          aria-label="关闭"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
        <div className="dialog-warning">
          <AlertTriangle size={22} />
        </div>
        <div className="eyebrow">
          需要你的确认 · {riskLabel[auth.riskLevel]}
        </div>
        <h2>AI 想要“{auth.action}”</h2>
        <div className="explain-grid">
          <div>
            <span>为什么需要</span>
            <p>{auth.reason}</p>
          </div>
          <div>
            <span>涉及资源</span>
            <p>{auth.resource}</p>
          </div>
          <div>
            <span>可能后果</span>
            <p>{auth.consequence}</p>
          </div>
          <div>
            <span>长期规则</span>
            <p>此次选择不会改变“每次询问”规则。</p>
          </div>
        </div>
        <div className="dialog-note">
          <ShieldCheck size={16} />{" "}
          此处保存授权决定，不会自动操作设备或联系第三方。
        </div>
        <div className="dialog-actions">
          <Button
            variant="quiet"
            onClick={() => decide("reject")}
            disabled={busy}
          >
            拒绝
          </Button>
          <Button
            variant="primary"
            onClick={() => decide("approve")}
            disabled={busy}
          >
            {busy ? "记录中…" : "仅此次允许"}
          </Button>
        </div>
        <button className="rule-edit" onClick={onEditRules}>
          修改授权规则
        </button>
      </div>
    </div>
  );
}

function Assistant() {
  const state = useProductStore();
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const showLatest = () => {
    followLatestRef.current = true;
    setFollowing(true);
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  };
  useEffect(() => {
    const stream = streamRef.current;
    if (stream && followLatestRef.current)
      stream.scrollTop = stream.scrollHeight;
  }, [state.aiMessages.length, thinking]);
  const { listening, voiceError, startVoice } = useSpeechInput((text) => {
    const combined = input.trim() ? `${input}\n${text}` : text;
    if (combined.length > 4000) return false;
    setInput(combined);
    return true;
  });
  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = input.trim();
    if (!value || thinking || state.busy) return;
    showLatest();
    setInput("");
    setThinking(true);
    try {
      await productStore.sendMessage(value);
    } finally {
      setThinking(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="家庭安全协同"
        title="AI 助手"
        description="先理解情况，再给出行动；重要操作不会静默执行。"
        action={
          <Button
            variant="secondary"
            disabled={thinking || Boolean(state.busy)}
            onClick={() => {
              showLatest();
              productStore.resetConversation();
            }}
          >
            <RefreshCw size={15} /> 新对话
          </Button>
        }
      />
      {state.lastError && (
        <Panel className="error-state">
          <AlertTriangle size={19} />
          <div>
            <strong>AI 服务暂时不可用</strong>
            <p>{state.lastError}</p>
          </div>
          <Button variant="secondary" onClick={() => productStore.clearError()}>
            关闭提示
          </Button>
          {!state.demoMode && (
            <Button
              variant="quiet"
              onClick={() => void productStore.refreshRecords()}
            >
              核对家庭记录
            </Button>
          )}
        </Panel>
      )}
      <div className="assistant-layout">
        <Panel className="chat-panel">
          <div className="chat-head">
            <div className="agent-avatar">
              <Bot size={20} />
            </div>
            <div>
              <strong>家有备 Agent</strong>
              <p>
                <i className="online-dot" />{" "}
                {state.demoMode
                  ? "示例家庭 · 情景演示"
                  : "使用当前家庭的授权信息"}
              </p>
            </div>
            <span className="model-tag">规则复核开启</span>
          </div>
          <div
            className="chat-stream"
            ref={streamRef}
            onScroll={() => {
              const stream = streamRef.current;
              if (!stream) return;
              const latest =
                stream.scrollHeight - stream.clientHeight - stream.scrollTop <
                60;
              followLatestRef.current = latest;
              setFollowing(latest);
            }}
          >
            {state.aiMessages.map((m) => (
              <div className={`message ${m.role}`} key={m.id}>
                {m.role === "assistant" && (
                  <div className="message-avatar">
                    <Bot size={15} />
                  </div>
                )}
                <div className="bubble">
                  <p>{m.text}</p>
                  {m.cardType === "authorization" && (
                    <div className="ai-card risk-card">
                      <div>
                        <LockKeyhole size={16} />
                        <strong>高风险操作需要确认</strong>
                      </div>
                      <p>
                        AI 无权直接打开入户门锁。请前往授权中心查看原因和后果。
                      </p>
                      <button onClick={() => navigate("/authorizations")}>
                        查看授权请求 <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  {m.cardType === "task" && (
                    <div className="ai-card">
                      {(() => {
                        const rt = state.tasks.find(
                          (t) => t.id === m.relatedId,
                        );
                        return (
                          <>
                            <div>
                              <Check size={16} />
                              <strong>
                                {m.analysisMode === "demo"
                                  ? "已创建演示核实任务"
                                  : "已创建家庭任务"}
                              </strong>
                            </div>
                            <p>
                              {rt
                                ? `${rt.title} · 责任人：${state.members.find((x) => x.id === rt.assignee)?.name ?? rt.assignee} · ${rt.status === "to_receive" ? "等待接受" : rt.status === "in_progress" ? "执行中" : "待确认"}`
                                : "任务已创建，请前往任务中心查看"}
                            </p>
                            <button
                              onClick={() =>
                                navigate(rt ? `/tasks/${rt.id}` : "/tasks")
                              }
                            >
                              查看任务 <ArrowRight size={14} />
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <small>
                    {m.createdAt}
                    {m.analysisMode
                      ? ` · ${m.analysisMode === "demo" ? "演示分析" : m.analysisMode === "live_model" ? "模型分析" : "规则分析"}`
                      : ""}
                  </small>
                </div>
                {m.role === "user" && (
                  <Avatar
                    member={state.members.find(
                      (x) =>
                        x.id === state.user.id || x.name === state.user.name,
                    )}
                    size="sm"
                  />
                )}
              </div>
            ))}
            {thinking && (
              <div className="message assistant">
                <div className="message-avatar">
                  <Bot size={15} />
                </div>
                <div className="bubble thinking">
                  <i />
                  <i />
                  <i /> 正在读取家庭上下文…
                </div>
              </div>
            )}
          </div>
          {!following && (
            <div className="chat-latest">
              <Button variant="quiet" onClick={showLatest}>
                查看最新消息
              </Button>
            </div>
          )}
          <form className="composer" onSubmit={send}>
            {voiceError && (
              <p className="voice-error" role="alert">
                {voiceError}
              </p>
            )}
            <div className="quick-prompts">
              <button
                type="button"
                onClick={() =>
                  setInput("我爸今天晚上还没回家，帮我看看有没有异常")
                }
              >
                老人长时间未活动
              </button>
              <button
                type="button"
                onClick={() => setInput("门口有个陌生人请求开门")}
              >
                陌生人请求开门
              </button>
              <button
                type="button"
                onClick={() => setInput("厨房闻到燃气味，传感器也在报警")}
              >
                烟雾 / 燃气告警
              </button>
            </div>
            <div className="composer-box">
              <button
                type="button"
                className={`voice-button ${listening ? "listening" : ""}`}
                aria-label={listening ? "停止语音输入" : "语音输入"}
                aria-pressed={listening}
                onClick={startVoice}
              >
                <Mic size={17} />
              </button>
              <textarea
                name="family-situation"
                aria-label="描述家庭情况"
                autoComplete="off"
                value={input}
                maxLength={4000}
                onChange={(e) => setInput(e.target.value)}
                placeholder="告诉家有备发生了什么…"
                rows={1}
              />
              <button
                className="send-button"
                type="submit"
                aria-label="发送消息"
                disabled={thinking || Boolean(state.busy) || !input.trim()}
              >
                <ArrowRight size={17} />
              </button>
            </div>
            <small>AI 输出仅用于协同建议，不构成医疗或消防专业判断。</small>
          </form>
        </Panel>
        <aside className="assistant-aside">
          <Panel>
            <SectionTitle title="本轮上下文" detail="仅使用已授权信息" />
            <div className="context-row">
              <Avatar member={state.members[0]} />
              <div>
                <strong>
                  {state.family.name} · {state.members.length} 位成员
                </strong>
                <p>{state.family.address || "家庭地址未填写"}</p>
              </div>
              <Check size={15} />
            </div>
            <div className="context-row">
              <span className="context-icon">
                <DoorOpen size={16} />
              </span>
              <div>
                <strong>{state.devices.length} 个设备记录</strong>
                <p>
                  {state.demoMode
                    ? "当前使用示例设备状态"
                    : "服务端分析会读取可用设备信号"}
                </p>
              </div>
              <Check size={15} />
            </div>
            <div className="context-row">
              <span className="context-icon amber">
                <ShieldCheck size={16} />
              </span>
              <div>
                <strong>关键动作需确认</strong>
                <p>门锁与摄像头始终不自动执行</p>
              </div>
              <Check size={15} />
            </div>
          </Panel>
          <Panel>
            <SectionTitle
              title="历史对话"
              action={
                <button
                  className="link-button"
                  onClick={() => setShowHistory(true)}
                >
                  查看全部
                </button>
              }
            />
            <p className="setting-description">
              当前会话共{" "}
              {
                state.aiMessages.filter((message) => message.role === "user")
                  .length
              }{" "}
              条提问。对话保存在当前页面会话中。
            </p>
          </Panel>
        </aside>
      </div>
      {showHistory && (
        <Dialog title="本次会话记录" onClose={() => setShowHistory(false)}>
          <div className="history-dialog-list">
            {state.aiMessages.map((message) => (
              <div key={message.id}>
                <strong>{message.role === "user" ? "你" : "家有备 AI"}</strong>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <div className="dialog-actions">
            <Button onClick={() => setShowHistory(false)}>关闭记录</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function AddItemDialog({
  title,
  fields,
  busy,
  initialValues = {},
  onSubmit,
  onClose,
}: {
  title: string;
  fields: {
    key: string;
    label: string;
    placeholder?: string;
    options?: string[];
  }[];
  busy: boolean;
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const close = () => {
    if (!busy) onClose();
  };
  const dialogRef = useDialogFocusTrap(close);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(
      fields
        .filter((field) => field.options)
        .map((field) => [field.key, field.options![0]]),
    ),
    ...initialValues,
  }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit(values);
  };
  return (
    <div className="dialog-backdrop" role="presentation" onClick={close}>
      <div
        ref={dialogRef}
        className="add-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="关闭"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
        <h2>{title}</h2>
        <form onSubmit={submit}>
          <div className="add-dialog-fields">
            {fields.map((f) =>
              f.options ? (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <select
                    value={values[f.key] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.value })
                    }
                  >
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <input
                    required={f.key === "name" || f.key === "contact"}
                    disabled={busy}
                    maxLength={f.key === "phone" ? 50 : 200}
                    value={values[f.key] ?? ""}
                    placeholder={f.placeholder ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.value })
                    }
                  />
                </label>
              ),
            )}
          </div>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "保存中…"
                : title.startsWith("编辑")
                  ? "保存修改"
                  : "添加"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MembersPage({ id }: { id?: string }) {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  if (id) return <MemberDetail key={id} id={id} />;
  const addMember = async (v: Record<string, string>) => {
    const stillCurrent = captureScope();
    setBusy(true);
    try {
      await productStore.addMember(v);
      if (!stillCurrent()) return;
      setAdding(false);
      notifyGlobal("家庭成员已添加");
    } catch (error) {
      if (!stillCurrent()) return;
      notifyGlobal(error instanceof Error ? error.message : "添加失败，请重试");
    }
    if (stillCurrent()) setBusy(false);
  };
  return (
    <>
      <PageHeader
        eyebrow="家庭协同"
        title="家庭成员"
        description="按角色、位置和权限组织家庭协作，敏感信息只在授权范围内使用。"
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> 添加成员
          </Button>
        }
      />
      <div className="member-grid">
        {state.members.map((m) => (
          <button
            className="member-card"
            key={m.id}
            onClick={() => navigate(`/members/${m.id}`)}
          >
            <div className="member-card-top">
              <Avatar member={m} size="lg" />
              <span className={m.online ? "online-state" : "offline-state"}>
                <i />
                {m.online ? "在线" : "离线"}
              </span>
            </div>
            <h3>{m.name}</h3>
            <p>
              {m.relation} · {m.role}
            </p>
            <div className="member-location">
              <Activity size={14} /> {m.location}
            </div>
            <div className="member-card-foot">
              <span>
                {
                  state.tasks.filter(
                    (task) =>
                      task.assignee === m.id && !["completed", "cancelled"].includes(task.status),
                  ).length
                }{" "}
                项待办任务
              </span>
              <ChevronRight size={16} />
            </div>
          </button>
        ))}
      </div>
      {adding && (
        <AddItemDialog
          title="添加家庭成员"
          fields={[
            { key: "name", label: "姓名", placeholder: "如 张阿姨" },
            {
              key: "relation",
              label: "与户主关系",
              placeholder: "如 母亲 / 邻居",
            },
            {
              key: "role",
              label: "角色",
              placeholder: "如 家庭成员 / 临时照护者",
            },
            { key: "phone", label: "联系电话", placeholder: "选填" },
          ]}
          busy={busy}
          onSubmit={addMember}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
function MemberDetail({ id }: { id: string }) {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const m = state.members.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [revokingAccess, setRevokingAccess] = useState(false);
  const realAuth = useRealAuthMode(state.demoMode);
  const admin = ["家庭管理员", "admin"].includes(state.user.role);
  if (!m)
    return (
      <NotFound
        title="内容不存在"
        detail={`未找到成员 ${id}，未显示其他成员的敏感信息。`}
        backPath="/members"
      />
    );
  const tasks = state.tasks.filter((t) => t.assignee === m.id);
  const accessibleDevices = state.devices.filter(
    (device) =>
      m.permissions.includes("设备控制") ||
      m.permissions.includes(device.id) ||
      m.permissions.includes(`device:${device.id}`),
  );
  const recentLogs = state.auditLogs
    .filter(
      (log) =>
        log.actor === m.name ||
        log.target.includes(m.name) ||
        log.target === m.id ||
        log.target.startsWith(`${m.id} `) ||
        (m.userId &&
          (log.target === m.userId || log.target.startsWith(`${m.userId} `))),
    )
    .slice(0, 4);
  const recordNames = recordTargetIndex(state);
  const saveMember = async (v: Record<string, string>) => {
    const stillCurrent = captureScope();
    setEditBusy(true);
    try {
      await productStore.editMember(m.id, v);
      if (!stillCurrent()) return;
      setEditing(false);
      notifyGlobal("成员资料已更新");
    } catch (error) {
      if (!stillCurrent()) return;
      notifyGlobal(error instanceof Error ? error.message : "保存失败，请重试");
    }
    if (stillCurrent()) setEditBusy(false);
  };
  return (
    <>
      <button className="back-button" onClick={() => navigate("/members")}>
        <ArrowLeft size={15} /> 返回家庭成员
      </button>
      <PageHeader
        eyebrow="成员详情"
        title={m.name}
        description={`${m.relation} · ${m.role}`}
        action={
          <span className={m.online ? "online-state" : "offline-state"}>
            <i />
            {m.online ? "在线" : "离线"}
          </span>
        }
      />
      <div className="member-detail-grid">
        <Panel className="member-profile">
          <Avatar member={m} size="xl" />
          <h2>{m.name}</h2>
          <p>
            {m.relation} · {m.role}
          </p>
          <div className="profile-lines">
            <div>
              <span>联系电话</span>
              <strong>{m.phone}</strong>
            </div>
            <div>
              <span>当前位置</span>
              <strong>{m.location}</strong>
            </div>
            <div>
              <span>紧急联系人</span>
              <strong>
                {m.emergencyContact ? "已加入紧急联系人" : "未设置"}
              </strong>
            </div>
          </div>
          <Button
            variant="secondary"
            disabled={!admin}
            onClick={() => setEditing(true)}
          >
            编辑成员资料
          </Button>
          {realAuth && (
            <div className="member-account-state">
              {m.userId ? (
                <p>
                  <ShieldCheck size={14} /> 已关联登录账号
                </p>
              ) : admin ? (
                <Button
                  variant="quiet"
                  disabled={Boolean(state.busy)}
                  onClick={() => setInviting(true)}
                >
                  <Users size={15} /> 邀请这位家人
                </Button>
              ) : (
                <p>尚未关联登录账号</p>
              )}
            </div>
          )}
          {realAuth && m.userId && (
            <p className="setting-description">
              账号权限：
              {["家庭管理员", "admin"].includes(m.accountRole ?? "")
                ? "家庭管理员"
                : "普通成员"}
            </p>
          )}
          {realAuth &&
            admin &&
            m.userId &&
            m.accountRole === "家庭成员" &&
            m.userId !== state.user.id && (
              <Button
                variant="quiet"
                disabled={Boolean(state.busy)}
                onClick={() => setRevokingAccess(true)}
              >
                停止账号访问
              </Button>
            )}
          {inviting && (
            <InviteMemberDialog
              memberId={m.id}
              name={m.name}
              onClose={() => setInviting(false)}
            />
          )}
          {revokingAccess && (
            <RevokeMemberAccessDialog
              memberId={m.id}
              name={m.name}
              onClose={() => setRevokingAccess(false)}
              onDone={() => {
                setRevokingAccess(false);
                notifyGlobal("成员账号访问已停止");
              }}
            />
          )}
          {editing && (
            <AddItemDialog
              title={`编辑 ${m.name} 的资料`}
              initialValues={{
                name: m.name,
                relation: m.relation,
                role: m.role,
                phone: m.phone,
              }}
              fields={[
                { key: "name", label: "姓名" },
                { key: "relation", label: "与户主关系" },
                { key: "role", label: "角色" },
                { key: "phone", label: "联系电话" },
              ]}
              busy={editBusy}
              onSubmit={saveMember}
              onClose={() => setEditing(false)}
            />
          )}
        </Panel>
        <div className="member-detail-main">
          <Panel>
            <SectionTitle title="当前任务" detail="与该成员相关的协同事项" />
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                members={state.members}
                events={state.events}
              />
            ))}
          </Panel>
          <Panel>
            <SectionTitle
              title="可访问设备"
              detail="来自成员资料中的设备权限记录"
            />
            <div className="compact-device-list">
              {accessibleDevices.slice(0, 5).map((d) => (
                <button
                  className="linked-row"
                  key={d.id}
                  onClick={() => navigate(`/devices/${d.id}`)}
                >
                  <span className="mini-icon">
                    <Wifi size={15} />
                  </span>
                  <span>
                    <strong>{d.name}</strong>
                    <small>
                      {d.room} · {d.permission}
                    </small>
                  </span>
                  <span className={d.online ? "online-state" : "offline-state"}>
                    <i />
                    {d.online ? "在线" : "离线"}
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </Panel>
          <Panel>
            <SectionTitle title="授权范围" detail="该成员可访问的内容" />
            <div className="permission-chips">
              {m.permissions.map((p) => (
                <span key={p}>
                  <Check size={13} />
                  {p}
                </span>
              ))}
            </div>
          </Panel>
          <Panel>
            <SectionTitle title="最近活动" detail="敏感操作和协同记录" />
            {recentLogs.length ? (
              <div className="activity-list">
                {recentLogs.map((log) => (
                  <div className="activity-row" key={log.id}>
                    <span className={`activity-dot ${log.result}`} />
                    <div>
                      <strong>{log.action}</strong>
                      <p>
                        {resolveRecordTarget(recordNames, log.target).label} ·{" "}
                        {log.reason}
                      </p>
                    </div>
                    <time>{log.time}</time>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="暂无近期敏感操作"
                detail="该成员近期没有设备或授权操作。"
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function DevicesPage({ id }: { id?: string }) {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const [kind, setKind] = useState("全部");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  if (id) return <DeviceDetail key={id} id={id} />;
  const kinds = ["全部", "安防", "环境", "照明", "门锁", "摄像头", "健康"];
  const kindMap: Record<string, string> = {
    安防: "security",
    环境: "environment",
    照明: "lighting",
    门锁: "lock",
    摄像头: "camera",
    健康: "health",
  };
  const list = state.devices.filter(
    (d) => kind === "全部" || d.kind === kindMap[kind],
  );
  const addDevice = async (v: Record<string, string>) => {
    const stillCurrent = captureScope();
    setBusy(true);
    try {
      await productStore.addDevice(v);
      if (!stillCurrent()) return;
      setAdding(false);
      notifyGlobal("设备已添加（模拟设备，等待同步）");
    } catch (error) {
      if (!stillCurrent()) return;
      notifyGlobal(error instanceof Error ? error.message : "添加失败，请重试");
    }
    if (stillCurrent()) setBusy(false);
  };
  return (
    <>
      <PageHeader
        eyebrow="家庭感知层"
        title="智能设备"
        description="统一读取家庭信号；设备是证据之一，不直接决定救援。"
        action={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                productStore.retryHydrate();
                notifyGlobal(
                  state.demoMode ? "当前为演示设备状态" : "正在刷新设备记录…",
                );
              }}
            >
              <RefreshCw size={15} /> 刷新状态
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus size={15} /> 添加设备
            </Button>
          </>
        }
      />
      <Panel className="device-summary-bar">
        <div className="connection-status">
          <span className="connection-orb">
            <Wifi size={19} />
          </span>
          <div>
            <strong>
              {state.demoMode ? "本地模拟设备" : "当前家庭设备记录"}
            </strong>
            <p>
              {state.demoMode
                ? "示例状态 · 用于演示家庭协同"
                : "设备接入状态以记录来源为准"}
            </p>
          </div>
        </div>
        <div className="device-counts">
          <span>
            <strong>{state.devices.filter((d) => d.online).length}</strong>在线
          </span>
          <span>
            <strong>{state.devices.filter((d) => !d.online).length}</strong>离线
          </span>
          <span>
            <strong>
              {state.devices.filter((d) => d.riskLevel !== "normal").length}
            </strong>
            需关注
          </span>
        </div>
      </Panel>
      <div className="filter-tabs device-tabs">
        {kinds.map((k) => (
          <button
            className={kind === k ? "active" : ""}
            key={k}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="device-grid">
        {list.map((d) => (
          <DeviceCard key={d.id} device={d} />
        ))}
      </div>
      {adding && (
        <AddItemDialog
          title="添加设备"
          fields={[
            {
              key: "name",
              label: "设备名称",
              placeholder: "如 阳台人体传感器",
            },
            {
              key: "kind",
              label: "设备类型",
              options: [
                "environment",
                "security",
                "lighting",
                "health",
                "other",
              ],
            },
            { key: "room", label: "安装位置", placeholder: "如 阳台 / 卧室" },
          ]}
          busy={busy}
          onSubmit={addDevice}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
function DeviceCard({ device }: { device: Device }) {
  const demoMode = useProductStore().demoMode;
  const icon =
    device.kind === "lock"
      ? LockKeyhole
      : device.kind === "environment"
        ? Thermometer
        : device.kind === "camera"
          ? Activity
          : device.kind === "lighting"
            ? Zap
            : Wifi;
  return (
    <button
      className={`device-card ${device.riskLevel}`}
      onClick={() => navigate(`/devices/${device.id}`)}
    >
      <div className="device-card-top">
        <span className={`device-icon ${device.kind}`}>
          <Icon icon={icon} size={19} />
        </span>
        <span className={device.online ? "online-state" : "offline-state"}>
          <i />
          {device.online ? "在线" : "离线"}
        </span>
      </div>
      <span className="device-room">{device.room}</span>
      <h3>{device.name}</h3>
      <strong>{device.reading}</strong>
      <p>
        {demoMode ? "示例设备" : device.source === "real"
          ? "真实设备"
          : device.source === "local"
            ? "本地驱动"
            : "模拟设备"}{" "}
        · {device.permission}
      </p>
      <div className="device-card-foot">
        <RiskBadge level={device.riskLevel} />
        <span>最后同步 {formatTime(device.lastSync)}</span>
      </div>
    </button>
  );
}
function ServicesPage() {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contactSvc, setContactSvc] = useState<null | {
    id: string;
    name: string;
    coverage: string;
    contact: string;
    verified: boolean;
  }>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const addService = async (v: Record<string, string>) => {
    const stillCurrent = captureScope();
    setBusy(true);
    try {
      await productStore.addService(v);
      if (!stillCurrent()) return;
      setAdding(false);
      notifyGlobal("服务资源已添加，等待人工核实联系方式");
    } catch (error) {
      if (!stillCurrent()) return;
      notifyGlobal(error instanceof Error ? error.message : "添加失败，请重试");
    }
    if (stillCurrent()) setBusy(false);
  };
  const [verifyTarget, setVerifyTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [verifyNote, setVerifyNote] = useState("");
  const verifyService = async () => {
    if (!verifyTarget || verifyBusy) return;
    const stillCurrent = captureScope();
    setVerifyBusy(true);
    try {
      await productStore.verifyService(verifyTarget.id, verifyNote);
      if (!stillCurrent()) return;
      setVerifyTarget(null);
      setVerifyNote("");
      notifyGlobal("服务联系方式核实记录已保存");
    } catch (error) {
      if (!stillCurrent()) return;
      notifyGlobal(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      if (stillCurrent()) setVerifyBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="家庭外部协同"
        title="服务资源"
        description="留存家庭可联系的服务资源，以及人工核实记录。"
        action={
          <>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus size={16} /> 添加资源
            </Button>
          </>
        }
      />
      <div className="service-grid">
        {state.services.map((s) => (
          <Panel className="service-card" key={s.id}>
            <div className="service-top">
              <span className={`service-icon trust-${s.trustLevel}`}>
                <CircleHelp size={20} />
              </span>
              <span className={s.verified ? "verified" : "unverified"}>
                {s.verified ? (
                  <>
                    <Check size={13} /> 已核实
                  </>
                ) : (
                  <>
                    <AlertTriangle size={13} /> 未验证
                  </>
                )}
              </span>
            </div>
            <span className="service-category">{s.category}</span>
            <h2>{s.name}</h2>
            <p>{s.note}</p>
            <div className="service-meta">
              <span>服务范围</span>
              <strong>{s.coverage}</strong>
              <span>联系方式</span>
              <strong>{s.contact}</strong>
              <span>最近使用</span>
              <strong>{s.lastUsed}</strong>
            </div>
            <Button
              variant={s.verified ? "secondary" : "quiet"}
              onClick={() =>
                s.verified
                  ? setContactSvc(s)
                  : (setVerifyTarget(s), setVerifyNote(""))
              }
              disabled={verifyBusy}
            >
              {s.verified
                ? "联系服务"
                : verifyBusy
                  ? "验证中…"
                  : "核实联系方式"}
            </Button>
          </Panel>
        ))}
      </div>
      {adding && (
        <AddItemDialog
          title="添加服务资源"
          fields={[
            { key: "name", label: "资源名称", placeholder: "如 社区卫生站" },
            {
              key: "category",
              label: "类别",
              placeholder: "如 医疗服务 / 生活服务",
            },
            { key: "coverage", label: "服务范围", placeholder: "如 3 公里内" },
            { key: "contact", label: "联系方式", placeholder: "电话 / 地址" },
          ]}
          busy={busy}
          onSubmit={addService}
          onClose={() => setAdding(false)}
        />
      )}
      {verifyTarget && (
        <Dialog
          title={`核实 ${verifyTarget.name}`}
          onClose={() => {
            if (!verifyBusy) setVerifyTarget(null);
          }}
        >
          <p>
            填写实际联系或查询的方式与结果。此记录表示家庭成员已核实联系方式。
          </p>
          <label className="evidence-label" htmlFor="service-verification">
            核实方式与结果
          </label>
          <textarea
            id="service-verification"
            className="dialog-textarea"
            value={verifyNote}
            maxLength={1000}
            onChange={(event) => setVerifyNote(event.target.value)}
          />
          <div className="dialog-actions">
            <Button
              variant="quiet"
              disabled={verifyBusy}
              onClick={() => setVerifyTarget(null)}
            >
              取消
            </Button>
            <Button
              disabled={verifyBusy || verifyNote.trim().length < 8}
              onClick={verifyService}
            >
              {verifyBusy ? "保存中…" : "保存核实记录"}
            </Button>
          </div>
        </Dialog>
      )}
      {contactSvc && (
        <Dialog title={contactSvc.name} onClose={() => setContactSvc(null)}>
          <div className="dialog-warning">
            <CircleHelp size={21} />
          </div>
          <p>
            <strong>服务范围：</strong>
            {contactSvc.coverage}
            <br />
            <strong>联系方式：</strong>
            {contactSvc.contact}
          </p>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="quiet"
              onClick={() => setContactSvc(null)}
            >
              关闭
            </Button>
            <Button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(contactSvc.contact)
                  .then(() => {
                    notifyGlobal("联系方式已复制到剪贴板");
                    setContactSvc(null);
                  })
                  .catch(() => notifyGlobal("复制失败，请手动复制"));
              }}
            >
              复制联系方式
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function AuditPage() {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const recordNames = recordTargetIndex(state);
  const [actor, setActor] = useState("all");
  const [risk, setRisk] = useState("all");
  const [date, setDate] = useState("all");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const admin = ["家庭管理员", "admin"].includes(state.user.role);
  const logs = state.auditLogs.filter(
    (l) =>
      (actor === "all" || l.actorType === actor) &&
      (risk === "all" || l.riskLevel === risk) &&
      matchesDay(l.time, date, state.family.timezone),
  );
  const exportAudit = async () => {
    if (exportBusy || !admin) return;
    const stillCurrent = captureScope();
    setExportBusy(true);
    setExportError("");
    try {
      const result = state.demoMode
        ? {
            content: buildAuditCsv(logs),
            count: logs.length,
            generatedAt: new Date().toISOString(),
          }
        : await apiRequest<{
            content: string;
            count: number;
            generatedAt: string;
          }>("/api/audit/exports", {
            method: "POST",
            body: JSON.stringify({ actor, risk, date }),
          });
      if (!stillCurrent()) return;
      if (
        typeof result.content !== "string" ||
        !Number.isInteger(result.count) ||
        result.count < 0 ||
        !Number.isFinite(Date.parse(result.generatedAt))
      )
        throw new Error("导出结果不完整，请重试");
      const blob = new Blob(["\ufeff" + result.content], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `家有备审计记录-${result.generatedAt.slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (state.demoMode)
        productStore.audit(
          state.user.name,
          "user",
          "审计导出",
          "生成审计导出文件",
          `生成 ${result.count} 条记录（CSV）`,
          "success",
          "normal",
        );
      else void productStore.refreshRecords();
      notifyGlobal(`已生成 ${result.count} 条审计记录的导出文件`);
    } catch (cause) {
      if (!stillCurrent()) return;
      if (cause instanceof ApiError && cause.status === 401)
        productStore.endSession();
      else
        setExportError(
          cause instanceof Error ? cause.message : "导出未完成，请重试",
        );
    } finally {
      if (stillCurrent()) setExportBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="全程留痕"
        title="安全与审计"
        description="谁、在什么时候、对什么对象做了什么，为什么，是否成功。"
        action={
          <Button
            variant="secondary"
            disabled={exportBusy || !admin || Boolean(state.busy)}
            onClick={() => void exportAudit()}
          >
            {exportBusy ? "正在生成…" : "导出记录"}
          </Button>
        }
      />
      {!admin && (
        <p className="setting-description">批量导出由家庭管理员操作。</p>
      )}
      {exportError && (
        <p className="form-error" role="alert">
          {exportError}
        </p>
      )}
      <div className="audit-metrics">
        <Metric
          label="记录总数"
          value={state.auditLogs.length}
          note="当前家庭的操作记录"
          icon={Activity}
        />
        <Metric
          label="人工操作"
          value={
            state.auditLogs.filter((log) => log.actorType === "user").length
          }
          note="家庭成员主动操作"
          icon={ShieldCheck}
          tone="amber"
        />
        <Metric
          label="安全拦截"
          value={
            state.auditLogs.filter((log) => log.result === "blocked").length
          }
          note="规则拦截已记录"
          icon={LockKeyhole}
          tone="rose"
        />
        <Metric
          label="设备回传"
          value={
            state.auditLogs.filter((log) => log.actorType === "device").length
          }
          note="来自设备的记录"
          icon={Wifi}
          tone="blue"
        />
      </div>
      <Panel className="audit-panel">
        <div className="audit-toolbar">
          <div className="audit-controls">
            <div className="filter-tabs">
              {[
                ["all", "全部"],
                ["ai", "AI"],
                ["user", "用户"],
                ["device", "设备"],
                ["rule", "规则"],
              ].map(([k, l]) => (
                <button
                  className={actor === k ? "active" : ""}
                  key={k}
                  disabled={exportBusy}
                  onClick={() => setActor(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <select
              aria-label="风险级别"
              disabled={exportBusy}
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
            >
              <option value="all">全部风险</option>
              <option value="normal">正常</option>
              <option value="attention">关注</option>
              <option value="warning">警告</option>
              <option value="critical">紧急</option>
            </select>
            <select
              aria-label="日期范围"
              disabled={exportBusy}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              <option value="all">全部日期</option>
              <option value="today">今天</option>
              <option value="yesterday">昨天</option>
            </select>
          </div>
          <span className="muted">共 {logs.length} 条记录</span>
        </div>
        <div className="audit-table">
          <div className="audit-head">
            <span>时间</span>
            <span>操作者</span>
            <span>对象</span>
            <span>动作与原因</span>
            <span>风险</span>
            <span>结果</span>
          </div>
          {logs.map((l) => (
            <div className="audit-row" key={l.id}>
              <time>{formatDateTime(l.time, state.family.timezone)}</time>
              <span className="audit-actor">
                <span className={`actor-dot ${l.actorType}`} />
                {l.actor}
              </span>
              <span>
                {resolveRecordTarget(recordNames, l.target).path ? (
                  <AppLink
                    className="audit-target-link"
                    title={`原始记录对象：${l.target}`}
                    href={resolveRecordTarget(recordNames, l.target).path!}
                  >
                    {resolveRecordTarget(recordNames, l.target).label}
                  </AppLink>
                ) : (
                  <strong title={l.target}>
                    {resolveRecordTarget(recordNames, l.target).label}
                  </strong>
                )}
              </span>
              <span>
                <strong>{l.action}</strong>
                <small>{l.reason}</small>
              </span>
              <RiskBadge level={l.riskLevel} />
              <span className={`result result-${l.result}`}>
                {l.result === "success"
                  ? "成功"
                  : l.result === "blocked"
                    ? "已拦截"
                    : "失败"}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <EmptyState
              title="暂无匹配的记录"
              detail="切换操作者、风险级别或日期范围。"
            />
          )}
        </div>
      </Panel>
    </>
  );
}

function NotificationsPage() {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const markRead = async (id?: string) => {
    const stillCurrent = captureScope();
    setError("");
    const saved = await productStore.markNotificationRead(id);
    if (!stillCurrent()) return false;
    if (!saved) {
      setError(
        productStore.getSnapshot().lastError ?? "通知状态未保存，请稍后重试",
      );
      productStore.clearError();
    }
    return saved;
  };
  const list = state.notifications.filter(
    (n) =>
      filter === "all" ||
      (filter === "unread" ? !n.read : n.category === filter),
  );
  return (
    <>
      <PageHeader
        eyebrow="信息中心"
        title="通知中心"
        description="查看家庭事件、协作提醒和系统记录。"
        action={
          <Button
            variant="secondary"
            onClick={() => void markRead()}
            disabled={
              Boolean(state.busy) ||
              !state.notifications.some((notice) => !notice.read)
            }
          >
            全部标为已读
          </Button>
        }
      />
      <div className="notification-tabs">
        {[
          ["all", "全部"],
          ["unread", "未读"],
          ["urgent", "紧急"],
          ["action", "待处理"],
          ["family", "家庭动态"],
          ["system", "系统"],
        ].map(([k, l]) => (
          <button
            className={filter === k ? "active" : ""}
            key={k}
            onClick={() => setFilter(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Panel className="notification-list">
        {list.map((n) => (
          <button
            className={`notification-row ${!n.read ? "unread" : ""}`}
            data-notice-id={n.id}
            key={n.id}
            disabled={Boolean(state.busy)}
            onClick={async () => {
              const saved = await markRead(n.id);
              if (!saved) return;
              if (n.taskId) navigate(`/tasks/${n.taskId}`);
              else if (n.eventId) navigate(`/events/${n.eventId}`);
            }}
          >
            <span className={`notification-icon ${n.category}`}>
              <Bell size={17} />
            </span>
            <span>
              <strong>{n.title}</strong>
              <p>{n.detail}</p>
            </span>
            <time>{formatTime(n.time, state.family.timezone)}</time>
            <ChevronRight size={16} />
          </button>
        ))}
        {list.length === 0 && (
          <EmptyState
            title="暂无通知"
            detail={
              filter === "all"
                ? "新的家庭提醒会显示在这里。"
                : "当前分类没有通知，可切换其他分类。"
            }
          />
        )}
      </Panel>
    </>
  );
}

function DemoPage() {
  const state = useProductStore();
  const [busy, setBusy] = useState("");
  const run = (
    kind: Parameters<typeof productStore.triggerDemo>[0],
    label: string,
    path?: string,
  ) => {
    setBusy(kind);
    setTimeout(() => {
      productStore.triggerDemo(kind);
      setBusy("");
      if (path) navigate(path);
    }, 350);
  };
  const scenarios = [
    {
      kind: "elderly" as const,
      title: "老人长时间未活动",
      detail: "事件 → AI 分析 → 联系任务 → 逐级升级 → 事件解决",
      icon: Users,
      tone: "teal",
      path: "/events/E001",
    },
    {
      kind: "stranger" as const,
      title: "陌生人请求开门",
      detail: "AI 建议 → 风险规则 → 授权确认 → 拒绝并审计",
      icon: LockKeyhole,
      tone: "rose",
      path: "/authorizations",
    },
    {
      kind: "smoke" as const,
      title: "烟雾告警",
      detail: "硬告警优先 → 人工复核 → 状态回传",
      icon: AlertTriangle,
      tone: "amber",
      path: "/events/E003",
    },
    {
      kind: "pet" as const,
      title: "宠物喂食超时",
      detail: "超时检测 → 提醒照护者 → 请求完成证据",
      icon: Clock3,
      tone: "blue",
      path: "/tasks/T004",
    },
    {
      kind: "offline" as const,
      title: "设备离线",
      detail: "设备离线 → 系统通知 → 重新同步",
      icon: Wifi,
      tone: "gray",
      path: "/devices/D008",
    },
    {
      kind: "failure" as const,
      title: "AI 输出异常",
      detail: "模型不可用 → 规则降级 → 不执行外部动作",
      icon: Bot,
      tone: "gray",
      path: "/ai",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="课程展示"
        title="Demo 控制台"
        description="一键触发可观察的状态链路，现场演示不依赖真实设备和模型。"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              productStore.reset();
              notifyGlobal("Demo 状态已重置");
            }}
          >
            <RefreshCw size={15} /> 重置全部状态
          </Button>
        }
      />
      <Panel className="demo-intro">
        <div className="demo-play">
          <Zap size={25} />
        </div>
        <div>
          <strong>当前为 Mock 演示模式</strong>
          <p>
            所有操作仍遵循“AI 规划、规则设边界、人工做确认”，状态会同步到
            Dashboard、事件、任务、授权和审计。
          </p>
        </div>
        <span className="demo-live">
          <i /> 可演示
        </span>
      </Panel>
      {busy ? (
        <LoadingSkeleton />
      ) : (
        <div className="demo-grid">
          {scenarios.map((s) => (
            <Panel className="demo-card" key={s.kind}>
              <span className={`demo-icon ${s.tone}`}>
                <Icon icon={s.icon} size={21} />
              </span>
              <h2>{s.title}</h2>
              <p>{s.detail}</p>
              <Button
                onClick={() => run(s.kind, s.title, s.path)}
                disabled={Boolean(busy)}
              >
                {busy === s.kind ? "生成中…" : "触发场景"}{" "}
                <ArrowRight size={15} />
              </Button>
            </Panel>
          ))}
        </div>
      )}
      <Panel className="demo-state">
        <SectionTitle title="当前演示状态" detail="实时读取统一数据模型" />
        <div className="state-chips">
          <span>
            <strong>
              {state.events.filter((e) => e.status !== "closed").length}
            </strong>{" "}
            活跃事件
          </span>
          <span>
            <strong>
              {state.tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length}
            </strong>{" "}
            未完成任务
          </span>
          <span>
            <strong>
              {
                state.authorizations.filter((a) => a.status === "pending")
                  .length
              }
            </strong>{" "}
            待确认授权
          </span>
          <span>
            <strong>{state.auditLogs.length}</strong> 审计记录
          </span>
        </div>
      </Panel>
    </>
  );
}

let globalNotify: ((text: string) => void) | null = null;
function notifyGlobal(text: string) {
  globalNotify?.(text);
}
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(authApi.enabled);
  const [statusError, setStatusError] = useState("");
  const [statusAttempt, setStatusAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!authApi.enabled) return;
    void authApi
      .setupStatus()
      .then((status) => {
        if (active) setNeedsSetup(status.needsSetup);
      })
      .catch(() => {
        if (active) setStatusError("暂时无法检查账号状态，请重新连接。");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [statusAttempt]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || checking || statusError) return;
    if (!email.trim() || password.length < (needsSetup ? 8 : 1)) {
      setError(needsSetup ? "请填写邮箱和至少 8 位密码" : "请填写邮箱和密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (needsSetup) {
        await authApi.setup(email.trim(), password, name.trim() || undefined);
      } else {
        await authApi.login(email.trim(), password);
      }
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^API \d+: /, "")
          : "操作失败，请重试",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="welcome">
      <div className="welcome-mark">
        <span />
        <span />
        <span />
      </div>
      <div className="eyebrow">家庭安全协同 AI Agent</div>
      <h1>{needsSetup ? "创建你的家庭管理员账号" : "登录家庭空间"}</h1>
      <p>
        {needsSetup
          ? "这是首次使用：设置管理员邮箱与密码，再填写家庭资料并邀请家人。"
          : "使用已有账号登录；初次加入，请打开管理员提供的邀请链接。"}
      </p>
      <form className="login-form" onSubmit={submit}>
        <input
          aria-label="邮箱"
          type="email"
          required
          maxLength={254}
          disabled={checking || busy || Boolean(statusError)}
          autoComplete="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {needsSetup && (
          <input
            aria-label="称呼"
            type="text"
            maxLength={100}
            disabled={checking || busy || Boolean(statusError)}
            autoComplete="name"
            placeholder="称呼（可选，默认：家庭管理员）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          aria-label="密码"
          type="password"
          required
          maxLength={128}
          minLength={needsSetup ? 8 : 1}
          disabled={checking || busy || Boolean(statusError)}
          autoComplete={needsSetup ? "new-password" : "current-password"}
          placeholder="密码（至少 8 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {statusError && (
          <p className="login-error" role="alert">
            {statusError}
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setChecking(true);
                setStatusError("");
                setStatusAttempt((attempt) => attempt + 1);
              }}
            >
              重新连接
            </button>
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || checking || Boolean(statusError)}
        >
          {checking
            ? "正在检查账号…"
            : busy
              ? "处理中…"
              : needsSetup
                ? "创建账号并进入"
                : "登录"}
        </Button>
      </form>
      <small className="login-note">
        账号密码用于登录校验。使用云端 AI
        时，相关情况描述与家庭资料会发送给所配置的模型服务。
      </small>
    </div>
  );
}
function AppRouter({ initialPath }: { initialPath: string }) {
  useAppearance();
  const path = usePath(initialPath);
  const state = useProductStore();
  const [toast, setToast] = useState<{
    text: string;
    stillCurrent: () => boolean;
  }>();
  useSessionSync(!state.demoMode);
  useEffect(() => {
    globalNotify = (text) =>
      setToast({ text, stillCurrent: productStore.captureSession() });
    void productStore.hydrate();
    return () => {
      globalNotify = null;
    };
  }, []);
  if (path === "/join") return <JoinFamilyPage />;
  if (state.hydrationStatus === "unauthorized")
    return <Login onSuccess={() => productStore.retryHydrate()} />;
  let content: React.ReactNode;
  if (path === "/" || path === "/dashboard") content = <Dashboard />;
  else if (path === "/welcome") content = <Welcome />;
  else if (path === "/onboarding") content = <Onboarding />;
  else if (path === "/ai") content = <Assistant />;
  else if (path === "/memory") content = <FamilyMemory key={`${state.family.id}-${state.user.id}`} />;
  else if (path === "/care") content = <CareWorkspace key={`${state.family.id}-${state.user.id}`} />;
  else if (path === "/events") content = <EventsPage />;
  else if (path.startsWith("/events/"))
    content = <EventDetail key={path} id={path.split("/")[2]} />;
  else if (path === "/tasks") content = <TasksPage />;
  else if (path.startsWith("/tasks/"))
    content = (
      <TaskDetail key={path} id={path.split("/")[2]} onNotice={notifyGlobal} />
    );
  else if (path === "/authorizations") content = <AuthorizationsPage />;
  else if (path === "/members") content = <MembersPage />;
  else if (path.startsWith("/members/"))
    content = <MembersPage id={path.split("/")[2]} />;
  else if (path === "/devices") content = <DevicesPage />;
  else if (path === "/cv") content = <CvFallMonitor />;
  else if (path.startsWith("/devices/"))
    content = <DevicesPage id={path.split("/")[2]} />;
  else if (path === "/services") content = <ServicesPage />;
  else if (path === "/audit") content = <AuditPage />;
  else if (path === "/notifications") content = <NotificationsPage />;
  else if (path === "/settings") content = <SettingsPage />;
  else if (path === "/demo") content = <DemoPage />;
  else content = <NotFound />;
  const refreshing =
    (state.hydrationStatus === "idle" || state.hydrationStatus === "loading") &&
    state.family.id !== "loading-family";
  if (
    (state.hydrationStatus === "idle" || state.hydrationStatus === "loading") &&
    !refreshing
  )
    content = (
      <div className="bootstrap-state">
        <PageHeader
          eyebrow="安全连接"
          title="正在连接家庭空间"
          description="正在校验完整家庭数据；加载完成前不会开放敏感操作。"
        />
        <LoadingSkeleton />
      </div>
    );
  else if (state.hydrationStatus === "error")
    content = (
      <div className="bootstrap-state">
        <Panel className="error-state">
          <AlertTriangle size={19} />
          <div>
            <strong>无法连接真实家庭数据</strong>
            <p>{state.lastError}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => productStore.retryHydrate()}
          >
            重新连接
          </Button>
        </Panel>
      </div>
    );
  return (
    <AppShell path={path}>
      {refreshing && (
        <div className="record-refresh-progress" role="status">
          正在更新家庭记录…
        </div>
      )}
      <div className="page-body" inert={refreshing} aria-busy={refreshing}>
        {content}
      </div>
      {toast?.stillCurrent() && (
        <Toast text={toast.text} onClose={() => setToast(undefined)} />
      )}
    </AppShell>
  );
}
function Welcome() {
  const state = useProductStore();
  return (
    <div className="welcome">
      <div className="welcome-mark">
        <span />
        <span />
        <span />
      </div>
      <div className="eyebrow">家庭安全协同 AI Agent</div>
      <h1>
        重要的事，
        <br />
        <em>不只提醒，还要有人完成。</em>
      </h1>
      <p>
        家有备让家庭成员在异地照护、老人独居和突发事务中保持协同：AI
        理解情况，家庭一起做决定。
      </p>
      <div className="welcome-points">
        <span>
          <Sparkles size={16} />
          AI 理解
        </span>
        <span>
          <Users size={16} />
          家庭协作
        </span>
        <span>
          <ShieldCheck size={16} />
          安全确认
        </span>
      </div>
      <div className="welcome-actions">
        <Button onClick={() => navigate("/onboarding")}>
          进入我的家庭 <ArrowRight size={16} />
        </Button>
        {state.demoMode && (
          <Button variant="secondary" onClick={() => navigate("/")}>
            使用演示家庭
          </Button>
        )}
      </div>
    </div>
  );
}
function Onboarding() {
  const state = useProductStore();
  const [step, setStep] = useState(1);
  const steps = [
    {
      title: "确认家庭资料",
      detail: "在设置中确认家庭名称与地址，只共享家人需要了解的信息。",
      icon: Home,
      path: "/settings",
      action: "查看家庭资料",
      status: `当前家庭：${state.family.name}`,
    },
    {
      title: "添加家庭成员",
      detail:
        "留存成员称呼、关系和联系方式，方便安排任务。管理员可在成员详情生成邀请，让家人建立自己的登录账号。",
      icon: Users,
      path: "/members",
      action: "查看家庭成员",
      status: `已记录 ${state.members.length} 位家庭成员`,
    },
    {
      title: "准备服务联系人",
      detail: "为关键场景准备已经验证的家庭、邻里和社区资源。",
      icon: Bell,
      path: "/services",
      action: "查看服务资源",
      status: `${state.services.filter((service) => service.verified).length} 项联系方式有核实记录`,
    },
    {
      title: "检查授权规则",
      detail:
        "查看哪些请求需要人工决定。保存授权决定不会自动操作门锁或摄像头。",
      icon: ShieldCheck,
      path: "/authorizations",
      action: "查看授权中心",
      status: `${state.authorizations.filter((authorization) => authorization.status === "pending").length} 项操作等待人工确认`,
    },
  ];
  const current = steps[step - 1];
  return (
    <div className="onboarding">
      <div className="onboarding-top">
        <button className="brand-light" onClick={() => navigate("/")}>
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <strong>家有备</strong>
        </button>
        <button className="skip" onClick={() => navigate("/")}>
          跳过引导
        </button>
      </div>
      <div className="onboarding-body">
        <div className="stepper">
          {steps.map((s, i) => (
            <div className={step >= i + 1 ? "active" : ""} key={s.title}>
              <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
              <small>{s.title}</small>
            </div>
          ))}
        </div>
        <div className="onboarding-card">
          <span className="onboarding-icon">
            <Icon icon={current.icon} size={27} />
          </span>
          <div className="eyebrow">第 {step} 步 / 共 4 步</div>
          <h1>{current.title}</h1>
          <p>{current.detail}</p>
          <div className="onboarding-placeholder">
            <div>
              <Icon icon={current.icon} size={18} /> {current.status}
            </div>
            <div>
              <ShieldCheck size={18} />{" "}
              {state.demoMode
                ? "演示输入用于熟悉流程，刷新会恢复示例状态。"
                : "这是准备指南，请进入对应页面核实与填写资料。"}
            </div>
            <button
              className="link-button onboarding-link"
              onClick={() => navigate(current.path)}
            >
              {current.action} <ArrowRight size={14} />
            </button>
          </div>
          <div className="onboarding-actions">
            <Button
              variant="secondary"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
            >
              上一步
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)}>
                继续 <ArrowRight size={16} />
              </Button>
            ) : (
              <Button onClick={() => navigate("/")}>
                进入家庭空间 <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function NotFound({
  title = "页面不存在",
  detail = "这个家庭空间还没有配置该页面。",
  backPath = "/",
}: {
  title?: string;
  detail?: string;
  backPath?: string;
}) {
  return (
    <div className="not-found">
      <CircleHelp size={28} />
      <h1>{title}</h1>
      <p>{detail}</p>
      <Button onClick={() => navigate(backPath)}>返回上一层</Button>
    </div>
  );
}
export default function JiaYouBeiApp({
  initialPath = "/",
}: {
  initialPath?: string;
}) {
  return <AppRouter initialPath={initialPath} />;
}
