"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Home,
  LockKeyhole,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { productStore, useProductStore } from "@/lib/product-store";
import { AppLink, navigate } from "./navigation";
import { useDialogFocusTrap } from "./useDialogFocus";
import { useRecordSync } from "./useRecordSync";
import { formatTime } from "@/lib/format-time";

const groups: {
  label: string;
  items: readonly (readonly [string, string, LucideIcon])[];
}[] = [
  {
    label: "家庭协同",
    items: [
      ["/", "家庭总览", Home],
      ["/events", "事件中心", Activity],
      ["/tasks", "家庭任务", Check],
      ["/ai", "AI 助手", Sparkles],
    ],
  },
  {
    label: "家庭空间",
    items: [
      ["/members", "家庭成员", Users],
      ["/devices", "智能设备", Wifi],
      ["/cv", "视觉监测", Camera],
      ["/services", "服务资源", CircleHelp],
    ],
  },
  {
    label: "安全与管理",
    items: [
      ["/authorizations", "授权中心", ShieldCheck],
      ["/audit", "安全与审计", LockKeyhole],
    ],
  },
] as const;
const secondary = [
  ["/notifications", "通知中心", Bell],
  ["/settings", "设置", Settings],
  ["/demo", "Demo 控制台", Zap],
] as const;
const mobileItems = [
  ["/", "首页", Home],
  ["/events", "事件", Activity],
  ["/tasks", "任务", Check],
  ["/cv", "视觉", Camera],
] as const;
const isActive = (path: string, target: string) =>
  target === "/"
    ? path === "/" || path === "/dashboard"
    : path === target || path.startsWith(`${target}/`);

function MobileDrawer({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocusTrap(onClose);
  return (
    <div className="mobile-drawer-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="全部功能"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-drawer-head">
          <strong>全部功能</strong>
          <button aria-label="关闭菜单" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {[
          ...groups.map((group) => ({
            label: group.label,
            items: group.items,
          })),
          { label: "更多", items: secondary },
        ].map((group) => (
          <nav key={group.label} aria-label={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.items.map(([href, label, I]) => (
              <AppLink
                className="drawer-link"
                key={href}
                href={href}
                aria-current={isActive(path, href) ? "page" : undefined}
                onClick={onClose}
              >
                <I size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
                <ChevronRight size={15} aria-hidden="true" />
              </AppLink>
            ))}
          </nav>
        ))}
      </div>
    </div>
  );
}

export default function AppShell({
  children,
  path,
}: {
  children: ReactNode;
  path: string;
}) {
  const state = useProductStore();
  useRecordSync(!state.demoMode && state.hydrationStatus === "ready");
  const [mobileOpen, setMobileOpen] = useState(false);
  const unread = state.notifications.filter((notice) => !notice.read).length;
  const pending = state.events.filter(
    (event) => event.status === "pending_confirmation",
  ).length;
  const currentLabel =
    [...groups.flatMap((group) => group.items), ...secondary].find(([href]) =>
      isActive(path, href),
    )?.[1] ?? "家庭空间";
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector(".page-content h1");
      if (heading?.textContent)
        document.title = `${heading.textContent} · 家有备`;
      if (!document.querySelector('[role="dialog"]'))
        document.getElementById("main-content")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className="sidebar" aria-label="家庭空间导航">
        <AppLink className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>家有备</strong>
            <small>让关心，有所回应</small>
          </span>
        </AppLink>
        <AppLink className="family-switcher" href="/settings">
          <span className="avatar avatar-md tone-0">家</span>
          <span>
            <strong>{state.family.name}</strong>
            <small>
              <i className="online-dot" />
              {state.members.filter((member) => member.online).length}{" "}
              位成员在线
            </small>
          </span>
          <ChevronRight size={14} aria-hidden="true" />
        </AppLink>
        <div className="main-nav">
          {groups.map((group) => (
            <nav key={group.label} aria-label={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map(([href, label, I]) => (
                <AppLink
                  key={href}
                  href={href}
                  title={label}
                  className={isActive(path, href) ? "active" : ""}
                  aria-current={isActive(path, href) ? "page" : undefined}
                >
                  <I size={18} strokeWidth={1.7} aria-hidden="true" />
                  <span>{label}</span>
                  {href === "/events" && pending > 0 && (
                    <em aria-label={`${pending} 个待确认事件`}>{pending}</em>
                  )}
                </AppLink>
              ))}
            </nav>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="nav-divider" />
          {secondary.map(([href, label, I]) => (
            <AppLink
              key={href}
              href={href}
              title={label}
              className={`nav-link ${isActive(path, href) ? "active" : ""}`}
              aria-current={isActive(path, href) ? "page" : undefined}
            >
              <I size={17} strokeWidth={1.7} aria-hidden="true" />
              <span>{label}</span>
              {href === "/notifications" && unread > 0 && <em>{unread}</em>}
            </AppLink>
          ))}
          <div className="space-card">
            <span className="mode-dot" />
            <span>{state.demoMode ? "演示家庭" : "已连接家庭空间"}</span>
            <small>
              {state.demoMode ? "示例数据 · 可随时重置" : "当前家庭的云端记录"}
            </small>
          </div>
        </div>
      </aside>
      <main className="main-area" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="打开菜单"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="crumb">
            <span className="crumb-family">{state.family.name}</span>
            <ChevronRight size={12} aria-hidden="true" />
            <strong>{currentLabel}</strong>
          </div>
          <div className="topbar-actions">
            {!state.demoMode && state.hydrationStatus === "ready" && (
              <button
                className={`record-sync-button ${state.recordsRefreshing ? "refreshing" : ""}`}
                aria-label="刷新家庭记录"
                title={
                  state.recordsUpdatedAt
                    ? `记录更新于 ${formatTime(state.recordsUpdatedAt, state.family.timezone)}`
                    : "刷新家庭记录"
                }
                disabled={state.recordsRefreshing || Boolean(state.busy)}
                onClick={() => void productStore.refreshRecords()}
              >
                <RefreshCw size={15} />
                <span>{state.recordsRefreshing ? "正在更新" : "更新记录"}</span>
              </button>
            )}
            <span className="environment-pill">
              <i />
              {state.demoMode
                ? "演示模式"
                : state.family.mode === "mock"
                  ? "本地开发记录"
                  : "家庭空间"}
            </span>
            <button
              className="top-icon"
              aria-label={`通知${unread ? `，${unread} 条未读` : ""}`}
              onClick={() => navigate("/notifications")}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <AppLink className="profile-chip" href="/settings">
              <span className="avatar avatar-sm tone-3">
                {state.user.avatar}
              </span>
              <span>
                {state.user.name}
                <small>{state.user.role}</small>
              </span>
            </AppLink>
          </div>
        </header>
        <div className="page-content">
          {state.recordsSyncError && (
            <section className="record-sync-error" role="status">
              <AlertTriangle size={16} />
              <span>{state.recordsSyncError}</span>
              <button
                disabled={state.recordsRefreshing || Boolean(state.busy)}
                onClick={() => void productStore.refreshRecords()}
              >
                重新获取
              </button>
            </section>
          )}
          {state.hydrationStatus === "ready" &&
            state.lastError &&
            path !== "/ai" && (
              <section className="panel error-state global-error" role="alert">
                <AlertTriangle size={19} />
                <div>
                  <strong>数据同步未完成</strong>
                  <p>{state.lastError}</p>
                </div>
                <button
                  className="btn secondary"
                  onClick={() => productStore.clearError()}
                >
                  关闭提示
                </button>
              </section>
            )}
          {children}
          <footer className="app-footer">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>重要操作由家人确认，每一步都可追溯。</span>
            <AppLink href="/audit">查看记录</AppLink>
          </footer>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="主要功能">
        {mobileItems.map(([href, label, I]) => (
          <AppLink
            key={href}
            href={href}
            className={isActive(path, href) ? "active" : ""}
            aria-current={isActive(path, href) ? "page" : undefined}
          >
            <I size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </AppLink>
        ))}
        <button
          aria-label="更多功能"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20} />
          <span>更多</span>
        </button>
      </nav>
      {mobileOpen && (
        <MobileDrawer path={path} onClose={() => setMobileOpen(false)} />
      )}
    </div>
  );
}
