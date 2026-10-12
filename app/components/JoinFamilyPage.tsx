"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, ShieldCheck, Users } from "lucide-react";
import { invitationApi, type InvitationPreview } from "@/src/api/invitationApi";
import { ApiError } from "@/src/api/apiClient";
import { productStore, useProductStore } from "@/lib/product-store";
import { formatDateTime } from "@/lib/format-time";
import { Button } from "./ui";
import { navigate } from "./navigation";
const subscribe = (update: () => void) => {
  window.addEventListener("hashchange", update);
  return () => window.removeEventListener("hashchange", update);
};
const getToken = () =>
  new URLSearchParams(location.hash.slice(1)).get("invite") ?? "";
const emptyToken = () => "";
export default function JoinFamilyPage() {
  const state = useProductStore();
  const token = useSyncExternalStore(subscribe, getToken, emptyToken);
  const [result, setResult] = useState<{
    token: string;
    preview?: InvitationPreview;
    error?: string;
    expired?: boolean;
  }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const mounted = useRef(false);
  const pendingAcceptance = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingAcceptance.current?.abort();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (token)
      void invitationApi
        .preview(token, controller.signal)
        .then((preview) => {
          if (active) setResult({ token, preview });
        })
        .catch((cause) => {
          if (active)
            setResult({
              token,
              error:
                cause instanceof Error ? cause.message : "邀请暂时无法查看",
              expired: cause instanceof ApiError && cause.status === 410,
            });
        });
    return () => {
      active = false;
      controller.abort();
      pendingAcceptance.current?.abort();
    };
  }, [token, previewAttempt]);
  const preview = result?.token === token ? result.preview : undefined;
  const loggedIn = !state.demoMode && state.hydrationStatus === "ready";
  return (
    <main className="join-page">
      <section className="join-card">
        <span className="join-mark">
          <Users size={26} strokeWidth={1.6} />
        </span>
        <span className="eyebrow">家有备 · 家庭邀请</span>
        <h1>{preview ? `加入${preview.familyName}` : "加入家人的家庭空间"}</h1>
        {!token ? (
          <>
            <p>请从家庭管理员提供的邀请链接打开此页。</p>
            <Button variant="secondary" onClick={() => navigate("/")}>
              返回家庭入口
            </Button>
          </>
        ) : result?.token !== token ? (
          <p role="status">正在检查邀请…</p>
        ) : result.error ? (
          <>
            <p className="form-error" role="alert">
              {result.error}
            </p>
            <p>
              {result.expired
                ? "请家庭管理员重新生成邀请链接。"
                : "检查网络连接后，再读取这份邀请。"}
            </p>
            {!result.expired && (
              <Button
                onClick={() => {
                  setResult(undefined);
                  setPreviewAttempt((attempt) => attempt + 1);
                }}
              >
                重新检查邀请
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate("/")}>
              返回家庭入口
            </Button>
          </>
        ) : (
          preview && (
            <>
              <p>
                这是给 <strong>{preview.memberName}</strong>{" "}
                的邀请。填写管理员指定的邮箱，并设置你自己的登录密码。
              </p>
              <div className="join-facts">
                <ShieldCheck size={17} />
                <span>
                  加入后为普通成员，可查看家庭记录和处理协作任务。
                  <small>邀请有效至 {formatDateTime(preview.expiresAt)}</small>
                </span>
              </div>
              {loggedIn ? (
                <>
                  <p>当前已经登录。请先退出当前账号，再接受这份邀请。</p>
                  <Button onClick={() => navigate("/settings")}>
                    前往账号设置 <ArrowRight size={15} />
                  </Button>
                </>
              ) : (
                <form
                  className="task-create-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (busy || pendingAcceptance.current) return;
                    if (password !== confirmation) {
                      setError("两次输入的密码不一致");
                      return;
                    }
                    setBusy(true);
                    setError("");
                    const controller = new AbortController();
                    pendingAcceptance.current = controller;
                    try {
                      await invitationApi.accept(
                        token,
                        email.trim(),
                        password,
                        controller.signal,
                      );
                      if (
                        !mounted.current ||
                        controller.signal.aborted ||
                        token !== getToken()
                      )
                        return;
                      history.replaceState({}, "", "/");
                      productStore.retryHydrate();
                      navigate("/");
                    } catch (cause) {
                      if (
                        !mounted.current ||
                        controller.signal.aborted ||
                        token !== getToken()
                      )
                        return;
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "加入未完成，请重试",
                      );
                    } finally {
                      if (pendingAcceptance.current === controller)
                        pendingAcceptance.current = null;
                      if (mounted.current) setBusy(false);
                    }
                  }}
                >
                  <label>
                    邀请时指定的邮箱
                    <input
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      disabled={busy}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    设置登录密码
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      disabled={busy}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 8 位"
                    />
                  </label>
                  <label>
                    再次输入密码
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      disabled={busy}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </label>
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <Button type="submit" disabled={busy}>
                    {busy ? "正在加入…" : "创建账号并加入家庭"}
                    <ArrowRight size={15} />
                  </Button>
                </form>
              )}
            </>
          )
        )}
      </section>
    </main>
  );
}
