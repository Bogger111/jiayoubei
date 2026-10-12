"use client";
import { useEffect, useState } from "react";
import { Copy, Link2, UserPlus } from "lucide-react";
import { invitationApi, type Invitation } from "@/src/api/invitationApi";
import { formatDateTime } from "@/lib/format-time";
import { productStore } from "@/lib/product-store";
import Dialog from "./Dialog";
import { Button } from "./ui";
import { useAsyncScope } from "./useAsyncScope";

export default function InviteMemberDialog({
  memberId,
  name,
  onClose,
}: {
  memberId: string;
  name: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const captureScope = useAsyncScope();
  const [current, setCurrent] = useState<Invitation>();
  const [generated, setGenerated] = useState<{
    id: string;
    link: string;
    expiresAt: string;
  }>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const sameSession = productStore.captureSession();
    void invitationApi
      .list()
      .then((result) => {
        if (!active || !sameSession()) return;
        const pending = result.invitations.find(
          (invite) =>
            invite.memberId === memberId && invite.status === "pending",
        );
        setCurrent(pending);
        if (pending) setEmail(pending.email);
        setLoaded(true);
      })
      .catch((cause) => {
        if (active && sameSession())
          setError(cause instanceof Error ? cause.message : "邀请记录读取失败");
      });
    return () => {
      active = false;
    };
  }, [memberId, loadAttempt]);
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Dialog
      title={`邀请 ${name} 使用家有备`}
      onClose={close}
      busy={Boolean(busy)}
    >
      <div className="invite-intro">
        <UserPlus size={19} />
        <p>让这位家人用自己的账号查看家庭记录、处理任务。加入后为普通成员。</p>
      </div>
      <form
        className="task-create-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !loaded) return;
          const stillCurrent = captureScope();
          setBusy("create");
          setError("");
          setCopied(false);
          try {
            const result = await invitationApi.create(memberId, email.trim());
            if (!stillCurrent()) return;
            const url = new URL("/join", location.origin);
            url.hash = new URLSearchParams({ invite: result.token }).toString();
            setGenerated({
              id: result.id,
              link: url.href,
              expiresAt: result.expiresAt,
            });
            setCurrent({
              id: result.id,
              memberId,
              email: email.trim(),
              expiresAt: result.expiresAt,
              createdAt: new Date().toISOString(),
              status: "pending",
            });
            void productStore.refreshRecords();
          } catch (cause) {
            if (!stillCurrent()) return;
            setError(
              cause instanceof Error ? cause.message : "邀请未生成，请重试",
            );
          } finally {
            if (stillCurrent()) setBusy("");
          }
        }}
      >
        <label>
          这位家人的邮箱
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            disabled={Boolean(busy) || !loaded}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            placeholder="填写对方将用于登录的邮箱"
          />
        </label>
        <p className="setting-description">
          链接有效 24
          小时，只能使用一次。请亲自交给这位家人，系统不会代发邮件。重新生成会使旧链接失效。
        </p>
        {!loaded && !error && <p role="status">正在读取邀请记录…</p>}
        {current && (
          <div className="invite-pending">
            <Link2 size={16} />
            <div>
              <strong>{generated ? "邀请已生成" : "已有待使用的邀请"}</strong>
              <p>
                {current.email} · 截止 {formatDateTime(current.expiresAt)}
              </p>
            </div>
          </div>
        )}
        {generated && (
          <div className="invite-link-box">
            <label>
              邀请链接
              <input
                aria-label="邀请链接"
                readOnly
                value={generated.link}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <Button
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={async () => {
                const stillCurrent = captureScope();
                try {
                  await navigator.clipboard.writeText(generated.link);
                  if (!stillCurrent()) return;
                  setCopied(true);
                } catch {
                  if (!stillCurrent()) return;
                  setError("浏览器无法自动复制，请选择上方链接后复制。");
                }
              }}
            >
              <Copy size={15} />
              {copied ? "已复制链接" : "复制邀请链接"}
            </Button>
            <small>链接只在本次窗口显示。关闭后可以重新生成。</small>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!loaded && error && (
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            重新读取邀请
          </Button>
        )}
        <div className="dialog-actions">
          {current && (
            <Button
              variant="quiet"
              disabled={Boolean(busy)}
              onClick={async () => {
                const stillCurrent = captureScope();
                setBusy("revoke");
                setError("");
                try {
                  await invitationApi.revoke(current.id);
                  if (!stillCurrent()) return;
                  setCurrent(undefined);
                  setGenerated(undefined);
                  setCopied(false);
                  void productStore.refreshRecords();
                } catch (cause) {
                  if (!stillCurrent()) return;
                  setError(
                    cause instanceof Error ? cause.message : "撤销失败，请重试",
                  );
                } finally {
                  if (stillCurrent()) setBusy("");
                }
              }}
            >
              {busy === "revoke" ? "撤销中…" : "撤销邀请"}
            </Button>
          )}
          <Button
            type="submit"
            disabled={Boolean(busy) || !loaded || !email.trim()}
          >
            {busy === "create"
              ? "正在生成…"
              : current
                ? "重新生成链接"
                : "生成邀请链接"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
