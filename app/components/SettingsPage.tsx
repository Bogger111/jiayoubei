"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  Eye,
  LockKeyhole,
  Monitor,
  RotateCcw,
} from "lucide-react";
import { productStore, useProductStore } from "@/src/stores/productStore";
import { AppLink } from "./navigation";
import { Button, PageHeader, Panel, SectionTitle } from "./ui";
import Dialog from "./Dialog";
import { useAppearance } from "./useAppearance";
import {
  ensurePushSubscription,
  disablePushSubscription,
} from "@/src/api/pushApi";
import { authApi } from "@/src/api/authApi";
import ChangePasswordDialog from "./ChangePasswordDialog";
import { useAsyncScope } from "./useAsyncScope";

export default function SettingsPage() {
  const state = useProductStore();
  const captureScope = useAsyncScope();
  const { appearance, changeAppearance } = useAppearance();
  const [resetOpen, setResetOpen] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState("");
  const [authReal, setAuthReal] = useState(false);
  const [busy, setBusy] = useState("");
  const [notificationStatus, setNotificationStatus] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  useEffect(() => {
    let active = true;
    if (!state.demoMode)
      void authApi
        .setupStatus()
        .then((result) => {
          if (active) setAuthReal(result.authMode === "real");
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [state.demoMode]);
  const admin = state.user.role === "家庭管理员" || state.user.role === "admin";
  const exportData = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      mode: state.demoMode ? "mock" : "real",
      family: state.family,
      events: state.events,
      tasks: state.tasks,
      members: state.members,
      devices: state.devices,
      services: state.services,
      authorizations: state.authorizations,
      auditLogs: state.auditLogs,
      notifications: state.notifications,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `家有备家庭记录-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  };
  const change = (key: "largeText" | "reduceMotion") => {
    try {
      changeAppearance({ [key]: !appearance[key] });
      setError("");
    } catch {
      setError("浏览器暂时无法保存偏好，请检查存储权限。");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="家庭空间"
        title="设置"
        description="让信息更易读，让数据使用更清楚。"
      />
      <div className="preferences-layout">
        <div className="preferences-main">
          <Panel>
            <SectionTitle
              title="家庭空间"
              detail="当前登录家庭的基本信息"
              action={
                admin && (
                  <button
                    className="settings-link profile-edit"
                    disabled={Boolean(state.busy) || Boolean(busy)}
                    onClick={() => {
                      setProfileName(state.family.name);
                      setProfileAddress(state.family.address);
                      setProfileError("");
                      setProfileOpen(true);
                    }}
                  >
                    编辑家庭资料 <ArrowUpRight size={15} />
                  </button>
                )
              }
            />
            <dl className="settings-facts">
              <div>
                <dt>家庭名称</dt>
                <dd>{state.family.name}</dd>
              </div>
              <div>
                <dt>家庭地址</dt>
                <dd>{state.family.address || "未填写"}</dd>
              </div>
              <div>
                <dt>时区</dt>
                <dd>{state.family.timezone}</dd>
              </div>
              <div>
                <dt>当前成员</dt>
                <dd>
                  {state.user.name} · {state.user.role}
                </dd>
              </div>
            </dl>
            <AppLink href="/members" className="settings-link">
              管理家庭成员 <ArrowUpRight size={15} />
            </AppLink>
            {authReal && (
              <Button
                variant="secondary"
                disabled={Boolean(busy) || Boolean(state.busy)}
                onClick={() => {
                  setPasswordUpdated(false);
                  setPasswordOpen(true);
                }}
              >
                修改登录密码
              </Button>
            )}
            {authReal && (
              <Button
                variant="quiet"
                disabled={Boolean(busy) || Boolean(state.busy)}
                onClick={async () => {
                  const sameSession = productStore.captureSession();
                  const stillCurrent = captureScope();
                  setBusy("logout");
                  setError("");
                  try {
                    try {
                      await disablePushSubscription(sameSession);
                    } catch {
                      /* Server logout also revokes account subscriptions. */
                    }
                    if (!sameSession()) return;
                    await authApi.logout();
                    if (sameSession()) productStore.endSession();
                  } catch (cause) {
                    if (!stillCurrent()) return;
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "退出未完成，请重试",
                    );
                  } finally {
                    if (stillCurrent()) setBusy("");
                  }
                }}
              >
                {busy === "logout" ? "正在退出…" : "退出登录"}
              </Button>
            )}
            {passwordUpdated && (
              <p className="setting-description" role="status">
                登录密码已更新。其他设备需使用新密码登录。
              </p>
            )}
          </Panel>
          <Panel>
            <SectionTitle
              title="显示与阅读"
              detail="偏好保存在当前浏览器，刷新后仍然生效"
            />
            <div className="preference-row">
              <div>
                <strong>更大的文字</strong>
                <p>增大正文、记录和输入区，方便长辈阅读。</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="更大的文字"
                aria-checked={appearance.largeText}
                className={`switch ${appearance.largeText ? "on" : ""}`}
                onClick={() => change("largeText")}
              >
                <i />
              </button>
            </div>
            <div className="preference-row">
              <div>
                <strong>减少动态效果</strong>
                <p>降低界面动画，保留必要的进度提示。</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="减少动态效果"
                aria-checked={appearance.reduceMotion}
                className={`switch ${appearance.reduceMotion ? "on" : ""}`}
                onClick={() => change("reduceMotion")}
              >
                <i />
              </button>
            </div>
            {error && (
              <p className="voice-error" role="alert">
                {error}
              </p>
            )}
          </Panel>
          <Panel>
            <SectionTitle
              title="数据管理"
              detail="导出当前已加载的家庭记录，便于留存与检查"
            />
            <div className="setting-actions">
              <Button
                variant="secondary"
                disabled={!admin || state.hydrationStatus === "loading"}
                onClick={exportData}
              >
                <Download size={16} /> 导出家庭记录
              </Button>
              {state.demoMode && (
                <Button variant="quiet" onClick={() => setResetOpen(true)}>
                  <RotateCcw size={15} /> 重置演示状态
                </Button>
              )}
            </div>
            <p className="setting-description">
              导出包含家庭地址、成员联系方式和协作记录，请妥善保管。文件不含登录凭据和摄像头画面。
            </p>
            {!admin && <p className="muted">完整家庭记录由家庭管理员导出。</p>}
            {exported && (
              <p className="settings-success" role="status">
                <Check size={15} /> 已生成导出文件
              </p>
            )}
          </Panel>
        </div>
        <aside className="preferences-aside">
          <Panel className="runtime-panel">
            <span className="settings-section-icon">
              <Monitor size={20} />
            </span>
            <h2>运行环境</h2>
            <span className="source-pill">
              {state.demoMode
                ? "演示数据"
                : state.family.mode === "mock"
                  ? "本地开发记录"
                  : "家庭记录"}
            </span>
            <p>
              {state.demoMode
                ? "当前使用示例家庭，可演示事件、任务与授权流程。"
                : "家庭协作记录通过服务端保存。AI 会根据配置使用模型分析或规则模式。"}
            </p>
            <AppLink href="/demo" className="settings-link">
              答辩演示入口 <ArrowUpRight size={15} />
            </AppLink>
          </Panel>
          <Panel>
            <SectionTitle title="隐私与授权" />
            <div className="privacy-fact">
              <Eye size={17} />
              <div>
                <strong>视觉分析在本机进行</strong>
                <p>需手动开启摄像头或选择视频；只保存疑似事件摘要。</p>
              </div>
            </div>
            <div className="privacy-fact">
              <Monitor size={17} />
              <div>
                <strong>云端 AI 使用相关描述</strong>
                <p>
                  启用模型服务时，情况描述与相关家庭资料会发送给配置的服务；摄像头画面留在本机。
                </p>
              </div>
            </div>
            <div className="privacy-fact">
              <LockKeyhole size={17} />
              <div>
                <strong>关键动作由人确认</strong>
                <p>AI 的建议会进入授权流程，门锁和摄像头动作受保护。</p>
              </div>
            </div>
            <AppLink className="settings-link" href="/authorizations">
              查看授权规则 <ArrowUpRight size={15} />
            </AppLink>
            <AppLink className="settings-link" href="/audit">
              查看安全记录 <ArrowUpRight size={15} />
            </AppLink>
          </Panel>
          <Panel>
            <SectionTitle title="消息提醒" />
            <p className="setting-description">
              站内消息可在通知中心逐条查看和标记已读。系统通知需单独授权当前浏览器。
            </p>
            <AppLink className="settings-link" href="/notifications">
              管理通知 <ArrowUpRight size={15} />
            </AppLink>
            {!state.demoMode && (
              <div className="settings-notification-actions">
                <Button
                  variant="secondary"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    const stillCurrent = captureScope();
                    setBusy("push");
                    setNotificationStatus("");
                    try {
                      await ensurePushSubscription(stillCurrent);
                      if (!stillCurrent()) return;
                      setNotificationStatus(
                        "订阅已保存，实际送达仍取决于浏览器与网络。",
                      );
                    } catch (cause) {
                      if (!stillCurrent()) return;
                      setNotificationStatus(
                        cause instanceof Error
                          ? cause.message
                          : "通知未启用，请重试",
                      );
                    } finally {
                      if (stillCurrent()) setBusy("");
                    }
                  }}
                >
                  {busy === "push" ? "正在开启…" : "开启浏览器通知"}
                </Button>
                <Button
                  variant="quiet"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    const stillCurrent = captureScope();
                    setBusy("push-off");
                    try {
                      await disablePushSubscription(stillCurrent);
                      if (!stillCurrent()) return;
                      setNotificationStatus(
                        "当前浏览器的订阅已关闭，站内通知仍可查看。",
                      );
                    } catch (cause) {
                      if (!stillCurrent()) return;
                      setNotificationStatus(
                        cause instanceof Error
                          ? cause.message
                          : "关闭未完成，请重试",
                      );
                    } finally {
                      if (stillCurrent()) setBusy("");
                    }
                  }}
                >
                  关闭浏览器通知
                </Button>
              </div>
            )}
            {notificationStatus && (
              <p className="setting-description" role="status">
                {notificationStatus}
              </p>
            )}
          </Panel>
        </aside>
      </div>
      {resetOpen && (
        <Dialog title="重置演示状态" onClose={() => setResetOpen(false)}>
          <p>示例家庭的事件、任务、授权决定和对话将恢复初始状态。</p>
          <div className="dialog-actions">
            <Button variant="quiet" onClick={() => setResetOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                productStore.reset();
                setResetOpen(false);
              }}
            >
              重置演示状态
            </Button>
          </div>
        </Dialog>
      )}
      {passwordOpen && (
        <ChangePasswordDialog
          onClose={() => setPasswordOpen(false)}
          onDone={() => {
            setPasswordOpen(false);
            setPasswordUpdated(true);
            setNotificationStatus(
              "登录密码已更新，旧登录会话与通知订阅已撤销。需要提醒时可重新开启浏览器通知。",
            );
          }}
        />
      )}
      {profileOpen && (
        <Dialog
          title="编辑家庭资料"
          busy={busy === "profile"}
          onClose={() => {
            if (busy !== "profile") setProfileOpen(false);
          }}
        >
          <form
            className="task-create-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const stillCurrent = captureScope();
              setBusy("profile");
              setProfileError("");
              try {
                await productStore.editFamily({
                  name: profileName,
                  address: profileAddress,
                });
                if (!stillCurrent()) return;
                setProfileOpen(false);
              } catch (cause) {
                if (!stillCurrent()) return;
                setProfileError(
                  cause instanceof Error ? cause.message : "资料未保存，请重试",
                );
              } finally {
                if (stillCurrent()) setBusy("");
              }
            }}
          >
            <label>
              家庭名称
              <input
                required
                maxLength={100}
                disabled={busy === "profile"}
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
              />
            </label>
            <label>
              家庭地址
              <textarea
                maxLength={1000}
                disabled={busy === "profile"}
                value={profileAddress}
                onChange={(event) => setProfileAddress(event.target.value)}
                placeholder="仅填写家人确实需要共享的信息（选填）"
              />
            </label>
            {profileError && (
              <p className="form-error" role="alert">
                {profileError}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                variant="quiet"
                disabled={busy === "profile"}
                onClick={() => setProfileOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy === "profile" || !profileName.trim()}
              >
                {busy === "profile" ? "正在保存…" : "保存资料"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
