"use client";

import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";
import { useProductStore } from "@/lib/product-store";
import { selectDashboardSummary } from "@/lib/product-selectors";
import { recordTargetIndex, resolveRecordTarget } from "@/lib/record-target";
import type { Event, Task } from "@/lib/product-models";
import { formatDateTime } from "@/lib/format-time";
import { isTaskOverdue } from "@/lib/task-deadline";
import { useCurrentTime } from "./useCurrentTime";
import { AppLink, navigate } from "./navigation";
import {
  Avatar,
  Button,
  EmptyState,
  EventCard,
  PageHeader,
  Panel,
  RiskBadge,
  SectionTitle,
  TaskCard,
} from "./ui";

const priorityRank: Record<Task["priority"], number> = {
  urgent: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export default function Dashboard() {
  const state = useProductStore();
  const current = useCurrentTime();
  const summary = selectDashboardSummary(state);
  const activeEvents = summary.activeEvents
    .map((item) => state.events.find((event) => event.id === item.id))
    .filter((event): event is Event => Boolean(event));
  const pendingTasks = state.tasks
    .filter((task) => task.status !== "completed")
    .sort(
      (a, b) =>
        priorityRank[b.priority] - priorityRank[a.priority] ||
        Number(isTaskOverdue(b, current, !state.demoMode)) -
          Number(isTaskOverdue(a, current, !state.demoMode)) ||
        Number(Boolean(b.helpRequested)) - Number(Boolean(a.helpRequested)) ||
        a.dueAt.localeCompare(b.dueAt),
    );
  const pendingAuthorization =
    state.authorizations.find(
      (authorization) =>
        authorization.status === "pending" &&
        authorization.riskLevel === "critical",
    ) ??
    state.authorizations.find(
      (authorization) => authorization.status === "pending",
    );
  const mainPath = summary.priorityAction?.path ?? "/ai";
  const recordNames = recordTargetIndex(state);
  const metrics = [
    {
      label: "正在跟进",
      value: activeEvents.length,
      unit: "个事件",
      note: "按风险排序",
      icon: Activity,
      path: "/events",
    },
    {
      label: "家庭待办",
      value: pendingTasks.length,
      unit: "项任务",
      note: `${pendingTasks.filter((task) => isTaskOverdue(task, current, !state.demoMode)).length} 项已超时`,
      icon: Check,
      path: "/tasks",
    },
    {
      label: "家庭成员",
      value: summary.memberCount,
      unit: "位家人",
      note: `${state.members.filter((member) => member.online).length} 位在线`,
      icon: Users,
      path: "/members",
    },
    {
      label: "设备在线",
      value: `${summary.onlineDeviceCount}/${state.devices.length}`,
      unit: "台设备",
      note: !state.devices.length
        ? "尚未接入设备"
        : summary.offlineDeviceCount
          ? `${summary.offlineDeviceCount} 台需要检查`
          : "连接状态良好",
      icon: Wifi,
      path: "/devices",
    },
  ];
  return (
    <div className="dashboard-page">
      <PageHeader
        eyebrow="家庭总览"
        title={`${state.user.name}，家里的事一起照顾`}
        description="从一个信号，到有人回应。"
        action={
          <Button onClick={() => navigate("/ai")}>
            <Sparkles size={16} /> 描述家庭情况
          </Button>
        }
      />
      <section
        className={`priority-brief brief-${summary.riskLevel}`}
        aria-labelledby="priority-heading"
      >
        <div className="priority-copy">
          <span className="brief-kicker">
            <i />
            {summary.statusLabel}
          </span>
          <h2 id="priority-heading">
            {summary.priorityAction?.title ?? "当前没有待跟进的异常"}
          </h2>
          <p>{summary.description}</p>
          <div className="hero-actions">
            <Button onClick={() => navigate(mainPath)}>
              {summary.priorityAction?.label ?? "和家有备聊聊"}
              <ArrowRight size={16} />
            </Button>
            <AppLink className="link-button" href="/events">
              查看所有事件
              <ChevronRight size={15} />
            </AppLink>
          </div>
        </div>
        <div className="priority-context">
          <span className="eyebrow">需要你的决定</span>
          {pendingAuthorization ? (
            <>
              <div className="decision-icon">
                <ShieldCheck size={23} strokeWidth={1.5} />
              </div>
              <strong>{pendingAuthorization.action}</strong>
              <p>{pendingAuthorization.resource}</p>
              <AppLink href="/authorizations">
                {summary.pendingAuthorizationCount} 项授权等待确认{" "}
                <ArrowRight size={14} />
              </AppLink>
            </>
          ) : (
            <>
              <div className="decision-icon">
                <ShieldCheck size={23} strokeWidth={1.5} />
              </div>
              <strong>重要操作，家人做决定</strong>
              <p>当前没有待确认的授权</p>
              <AppLink href="/authorizations">
                查看家庭规则 <ArrowRight size={14} />
              </AppLink>
            </>
          )}
        </div>
      </section>
      <div className="overview-metrics">
        {metrics.map(({ label, value, unit, note, icon: I, path }) => (
          <AppLink className="overview-metric" href={path} key={label}>
            <span className="overview-metric-label">
              <I size={16} aria-hidden="true" />
              {label}
              <ArrowRight size={13} aria-hidden="true" />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{unit}</span>
            </div>
            <small>{note}</small>
          </AppLink>
        ))}
      </div>
      <div className="dashboard-grid focus-grid">
        <Panel className="events-panel">
          <SectionTitle
            title="正在关注"
            detail="先跟进风险更高的情况"
            action={
              <AppLink className="link-button" href="/events">
                全部事件 <ArrowRight size={14} />
              </AppLink>
            }
          />
          <div className="event-list">
            {activeEvents.slice(0, 2).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                members={state.members}
                onClick={() => navigate(`/events/${event.id}`)}
              />
            ))}
          </div>
          {activeEvents.length === 0 && (
            <EmptyState
              title="当前没有进行中的事件"
              detail="有新的家庭信号时，会在这里显示。"
            />
          )}
          {activeEvents.length > 2 && (
            <AppLink className="panel-more" href="/events">
              还有 {activeEvents.length - 2} 个事件正在跟进{" "}
              <ArrowRight size={14} />
            </AppLink>
          )}
        </Panel>
        <Panel className="tasks-panel">
          <SectionTitle
            title="接下来要做"
            detail="每一件事，都有明确的责任人"
            action={
              <AppLink className="link-button" href="/tasks">
                全部任务 <ArrowRight size={14} />
              </AppLink>
            }
          />
          <div className="task-list">
            {pendingTasks.slice(0, 2).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                members={state.members}
                onClick={() => navigate(`/tasks/${task.id}`)}
              />
            ))}
          </div>
          {pendingTasks.length === 0 && (
            <EmptyState
              title="待办已处理完"
              detail="完成的任务和记录可以在任务中心查看。"
            />
          )}
          {pendingTasks.length > 2 && (
            <AppLink className="panel-more" href="/tasks">
              还有 {pendingTasks.length - 2} 项家庭待办 <ArrowRight size={14} />
            </AppLink>
          )}
        </Panel>
      </div>
      <div className="dashboard-grid status-grid">
        <Panel>
          <SectionTitle
            title="家庭成员状态"
            detail="共享状态，保持适当的关心"
            action={
              <AppLink className="link-button" href="/members">
                全部成员 <ArrowRight size={14} />
              </AppLink>
            }
          />
          <div className="family-status-list">
            {state.members.slice(0, 4).map((member) => (
              <AppLink
                className="member-status-row"
                key={member.id}
                href={`/members/${member.id}`}
              >
                <Avatar member={member} />
                <span>
                  <strong>{member.name}</strong>
                  <small>
                    {member.role} · {member.location}
                  </small>
                </span>
                <span
                  className={member.online ? "online-state" : "offline-state"}
                >
                  <i />
                  {pendingTasks.some((task) => task.assignee === member.id)
                    ? "有任务"
                    : member.online
                      ? "在线"
                      : "离线"}
                </span>
                <ChevronRight size={14} aria-hidden="true" />
              </AppLink>
            ))}
            {state.members.length === 0 && (
              <EmptyState
                title="还没有家庭成员"
                detail="添加家人，为每件事安排合适的联系人。"
              />
            )}
          </div>
        </Panel>
        <Panel>
          <SectionTitle
            title="设备状态"
            detail="离线与异常设备优先显示"
            action={
              <AppLink className="link-button" href="/devices">
                全部设备 <ArrowRight size={14} />
              </AppLink>
            }
          />
          <div className="family-status-list">
            {[...state.devices]
              .sort(
                (a, b) =>
                  ({ normal: 0, attention: 1, warning: 2, critical: 3 })[
                    b.riskLevel
                  ] -
                    { normal: 0, attention: 1, warning: 2, critical: 3 }[
                      a.riskLevel
                    ] || Number(a.online) - Number(b.online),
              )
              .slice(0, 4)
              .map((device) => (
                <AppLink
                  className="member-status-row"
                  key={device.id}
                  href={`/devices/${device.id}`}
                >
                  <span className={`mini-icon ${device.online ? "" : "rose"}`}>
                    <Wifi size={16} />
                  </span>
                  <span>
                    <strong>{device.name}</strong>
                    <small>
                      {device.room} · {device.reading}
                    </small>
                  </span>
                  <RiskBadge level={device.riskLevel} />
                  <ChevronRight size={14} aria-hidden="true" />
                </AppLink>
              ))}
            {state.devices.length === 0 && (
              <EmptyState
                title="还没有连接设备"
                detail="连接设备后，可以在这里查看状态。"
              />
            )}
          </div>
        </Panel>
      </div>
      <Panel className="dashboard-records">
        <SectionTitle
          title="最近的回应"
          detail="了解谁做了什么，每一步有迹可循"
          action={
            <AppLink className="link-button" href="/audit">
              审计记录 <ArrowRight size={14} />
            </AppLink>
          }
        />
        <div className="activity-list">
          {state.auditLogs.slice(0, 3).map((log) => (
            <div className="activity-row" key={log.id}>
              <span className={`activity-dot ${log.result}`} />
              <div>
                <strong>{log.action}</strong>
                <p title={log.target}>
                  {log.actor} ·{" "}
                  {resolveRecordTarget(recordNames, log.target).label}
                </p>
              </div>
              <time title={log.time}>
                {formatDateTime(log.time, state.family.timezone)}
              </time>
            </div>
          ))}
        </div>
        {state.auditLogs.length === 0 && (
          <div className="quiet-empty">
            <Clock3 size={16} /> 家庭操作记录会在这里显示。
          </div>
        )}
      </Panel>
    </div>
  );
}
