"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, BookOpen, Camera, CheckCircle2, ChevronDown, CircleHelp, Home, Menu, Search, Settings, ShieldCheck, Users, Wifi, Activity, Presentation, Sparkles, ScrollText } from "lucide-react";
import { productStore, useProductStore } from "@/lib/product-store";
import { AppLink, navigate } from "./navigation";
import { useRecordSync } from "./useRecordSync";
import Dialog from "./Dialog";
import GlobalSearch from "./GlobalSearch";
const primary = [["/", "家庭", Home], ["/tasks", "行动", CheckCircle2], ["/devices", "设备", Wifi], ["/memory", "记忆", BookOpen]] as const;
const more = [["/care", "关怀确认", CheckCircle2], ["/events", "家庭事件", Activity], ["/ai", "和家有备聊聊", Sparkles], ["/members", "家庭成员", Users], ["/services", "附近联系人与服务", CircleHelp], ["/authorizations", "家庭授权", ShieldCheck], ["/audit", "操作记录", ScrollText], ["/cv", "视觉感知", Camera], ["/settings", "设置", Settings]] as const;
export default function QuietShell({ children, path }: { children: ReactNode; path: string }) {
  const state = useProductStore();
  useRecordSync(!state.demoMode && state.hydrationStatus === "ready");
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const unread = state.notifications.filter(item => !item.read).length;
  useEffect(() => {
    const plan = state.carePlan;
    if (!state.demoMode || state.busy || plan?.status !== "following" || plan.steps.find(step => step.id === "nearby")?.status !== "pending") return;
    const timer = setTimeout(() => productStore.advanceCare(), Math.max(0, (plan.nextCheckAt ?? Date.now()) - Date.now()));
    return () => clearTimeout(timer);
  }, [state.carePlan, state.demoMode, state.busy]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"]')) { event.preventDefault(); setSearch(true); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const frame = requestAnimationFrame(() => { const heading = document.querySelector(".page-content h1"); if (heading?.textContent) document.title = `${heading.textContent} · 家有备`; if (!document.querySelector('[role="dialog"]')) document.getElementById("main-content")?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [path]);
  return <div className="quiet-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="q-header">
      <AppLink className="q-brand" href="/" aria-label="家有备首页"><img src="/icon-192.png" alt="" width="46" height="46" /><strong>家有备</strong></AppLink>
      <nav className="q-nav" aria-label="主要功能">{primary.map(([href, label, Icon]) => <AppLink key={href} href={href} aria-current={path === href || (href !== "/" && path.startsWith(href + "/")) ? "page" : undefined}><Icon size={20} strokeWidth={1.7} /><span>{label}</span></AppLink>)}</nav>
      <div className="q-header-actions">
        <button className="q-icon q-search" aria-label="搜索家庭空间" title="搜索 · Ctrl K" onClick={() => setSearch(true)}><Search size={21} /></button>
        <button className="q-icon" aria-label={`通知${unread ? `，${unread} 条未读` : ""}`} onClick={() => navigate("/notifications")}><Bell size={22} />{unread > 0 && <i />}</button>
        <AppLink className="q-profile" href="/settings"><span>{state.user.avatar}</span><strong>{state.user.name}</strong><ChevronDown size={15} /></AppLink>
        <button className="q-icon" aria-label="更多功能" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={22} /></button>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className={`q-main page-content ${path === "/" || path === "/dashboard" ? "q-home-main" : ""}`}>
      {(state.recordsSyncError || state.lastError) && <section role="alert" className="q-error"><span>{state.recordsSyncError || state.lastError}</span><button onClick={() => state.recordsSyncError ? void productStore.refreshRecords() : productStore.clearError()}>{state.recordsSyncError ? "重新获取" : "关闭提示"}</button></section>}
      {children}
    </main>
    <footer className="q-footer"><span>家有备 · 让远方的关心，变成行动</span><span>{state.demoMode ? "演示家庭" : state.family.name}</span>{state.demoMode && <a href="/competition/" target="_blank" rel="noreferrer">打开比赛演示 <Presentation size={13} /></a>}</footer>
    {menu && <Dialog title="家庭空间" onClose={() => setMenu(false)}><nav className="q-more">{more.map(([href, label, Icon]) => <AppLink key={href} href={href} onClick={() => setMenu(false)}><Icon size={19} /><span>{label}</span></AppLink>)}{state.demoMode && <><AppLink href="/demo" onClick={() => setMenu(false)}><Activity size={19} />场景控制台</AppLink><a href="/competition/" target="_blank" rel="noreferrer" onClick={() => setMenu(false)}><Presentation size={19} />比赛演示</a></>}</nav></Dialog>}
    {search && <GlobalSearch onClose={() => setSearch(false)} />}
  </div>;
}
