"use client";

import type { ReactNode } from "react";
import { formatTime, formatDateTime } from "@/lib/format-time";
import { isTaskOverdue } from "@/lib/task-deadline";
import { useCurrentTime } from "./useCurrentTime";
import { useProductStore } from "@/lib/product-store";
import { Home, Check, Info, X, ChevronRight, Clock3 } from "lucide-react";
import type {
  RiskLevel,
  EventStatus,
  Task,
  FamilyMember,
  Event,
} from "@/lib/product-models";
import {
  riskLabel,
  eventStatusLabel,
  taskStatusLabel,
  priorityLabel,
} from "@/lib/product-models";
export type IconType = typeof Home;

export function Metric({
  label,
  value,
  note,
  icon,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  note: string;
  icon: IconType;
  tone?: string;
}) {
  return (
    <div className="metric-card">
      <span className={`metric-icon ${tone}`}>
        <Icon icon={icon} size={18} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

export function Icon({
  icon: I,
  size = 17,
}: {
  icon: IconType;
  size?: number;
}) {
  return <I size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`badge risk-${level}`}>
      <i />
      {riskLabel[level]}
    </span>
  );
}
export function StatusBadge({
  status,
}: {
  status: EventStatus | Task["status"];
}) {
  const label =
    status in eventStatusLabel
      ? eventStatusLabel[status as EventStatus]
      : taskStatusLabel[status as Task["status"]];
  return (
    <span className="badge status">
      <i />
      {label}
    </span>
  );
}
export function Avatar({
  member,
  size = "md",
}: {
  member?: FamilyMember;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <span
      className={`avatar avatar-${size} tone-${member?.id.slice(-1) ?? "0"}`}
    >
      {member?.avatar ?? "家"}
    </span>
  );
}
export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`btn ${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow" title={eyebrow}>
          {eyebrow}
        </div>
        <h1 className={title.length > 80 ? "compact-title" : undefined}>
          {title}
        </h1>
        {title.length > 80 && (
          <details className="header-text-details">
            <summary>查看完整标题</summary>
            <p>{title}</p>
          </details>
        )}
        {description && (
          <p>
            {description.length > 240
              ? `${description.slice(0, 220)}…`
              : description}
          </p>
        )}
        {description && description.length > 240 && (
          <details className="header-text-details">
            <summary>查看完整说明（{description.length} 字）</summary>
            <p>{description}</p>
          </details>
        )}
      </div>
      {action && <div className="header-actions">{action}</div>}
    </div>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Check size={22} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div
      className="loading-skeleton"
      role="status"
      aria-live="polite"
      aria-label="加载中"
    >
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
export function Toast({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  return (
    <div className="toast" role="status" aria-live="polite">
      <Info size={17} aria-hidden="true" />
      <span>{text}</span>
      <button aria-label="关闭提示" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}
export function EventCard({
  event,
  onClick,
  members,
}: {
  event: Event;
  onClick: () => void;
  members: FamilyMember[];
}) {
  return (
    <button
      className="event-card"
      onClick={onClick}
      aria-label={`${event.title}，${riskLabel[event.riskLevel]}，${eventStatusLabel[event.status]}`}
    >
      <div className="card-top">
        <RiskBadge level={event.riskLevel} />
        <StatusBadge status={event.status} />
        <span className="card-time">{formatTime(event.createdAt)}</span>
      </div>
      <h3>{event.title}</h3>
      <p>{event.description}</p>
      <div className="card-foot">
        <span className="member-stack">
          {event.relatedMembers.slice(0, 3).map((id) => (
            <Avatar
              key={id}
              member={members.find((m) => m.id === id)}
              size="sm"
            />
          ))}
        </span>
        <span>
          {event.relatedTasks.length} 项关联任务 <ChevronRight size={14} />
        </span>
      </div>
    </button>
  );
}
export function TaskCard({
  task,
  members,
  onClick,
}: {
  task: Task;
  members: FamilyMember[];
  onClick: () => void;
}) {
  const member = members.find((m) => m.id === task.assignee);
  const { demoMode } = useProductStore();
  const overdue = isTaskOverdue(task, useCurrentTime(), !demoMode);
  return (
    <button
      className="task-card"
      onClick={onClick}
      aria-label={`${task.title}，${taskStatusLabel[task.status]}${task.helpRequested ? "，需要协助" : ""}`}
    >
      <div className="card-top">
        <span className={`priority priority-${task.priority}`}>
          {priorityLabel[task.priority]}优先级
        </span>
        <StatusBadge status={task.status} />
      </div>
      <h3>{task.title}</h3>
      {task.helpRequested && task.status !== "completed" && (
        <em className="task-help-badge">需要协助</em>
      )}
      <p>{task.description}</p>
      <div className="task-foot">
        <span>
          <Avatar member={member} size="sm" /> {member?.name ?? task.assignee}
        </span>
        <span className={overdue ? "deadline-late" : undefined}>
          <Clock3 size={13} />{" "}
          {overdue ? "已超时" : `截止 ${formatDateTime(task.dueAt)}`}
        </span>
      </div>
    </button>
  );
}
