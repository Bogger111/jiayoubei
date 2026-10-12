"use client";
import { useEffect, useRef, useState } from "react";
import { authApi } from "@/src/api/authApi";
import { ApiError } from "@/src/api/apiClient";
import { productStore } from "@/lib/product-store";
import Dialog from "./Dialog";
import { Button } from "./ui";
import { useAsyncScope } from "./useAsyncScope";

export default function ChangePasswordDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const captureScope = useAsyncScope();
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);
  return (
    <Dialog
      title="修改登录密码"
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        验证当前密码后更新。其他设备的旧登录会失效，浏览器通知需要重新开启。
      </p>
      <form
        className="task-create-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || pending.current) return;
          const stillCurrent = captureScope();
          if (newPassword !== confirmation) {
            setError("两次输入的新密码不一致");
            return;
          }
          if (newPassword === currentPassword) {
            setError("新密码应与当前密码不同");
            return;
          }
          setBusy(true);
          setError("");
          const controller = new AbortController();
          pending.current = controller;
          try {
            await authApi.changePassword(
              currentPassword,
              newPassword,
              controller.signal,
            );
            if (stillCurrent() && !controller.signal.aborted) onDone();
          } catch (cause) {
            if (!stillCurrent() || controller.signal.aborted) return;
            if (cause instanceof ApiError && cause.status === 401) {
              productStore.endSession();
              return;
            }
            setError(
              cause instanceof ApiError && cause.status < 500
                ? cause.message
                : "修改结果尚未确认，请尝试用新密码登录后核对。",
            );
          } finally {
            if (pending.current === controller) pending.current = null;
            if (stillCurrent()) setBusy(false);
          }
        }}
      >
        <label>
          当前密码
          <input
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
            value={currentPassword}
            disabled={busy}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          新密码
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={newPassword}
            disabled={busy}
            placeholder="8 至 128 位"
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label>
          再次输入新密码
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={confirmation}
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "正在更新…" : "更新密码"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
