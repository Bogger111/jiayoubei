import { apiConfig, apiRequest } from "./apiClient";

/**
 * 注册 Service Worker 并订阅 Web Push（真实模式 + HTTPS 下生效）。
 * 由用户点击后调用；保存失败需要反馈，不能显示已启用。
 */
function requireCurrentSession(isCurrent: () => boolean) {
  if (!isCurrent()) throw new Error("会话已变更，请在当前账号重新操作");
}

export async function ensurePushSubscription(
  isCurrent: () => boolean,
): Promise<boolean> {
  requireCurrentSession(isCurrent);
  if (apiConfig.useMock) throw new Error("演示模式只使用站内通知");
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error("当前浏览器不支持系统通知");
  if (!window.isSecureContext)
    throw new Error("浏览器通知需要 HTTPS 或 localhost");
  const { publicKey } = await apiRequest<{ publicKey: string }>(
    "/api/push/vapid-key",
  );
  requireCurrentSession(isCurrent);
  if (!publicKey) throw new Error("服务端尚未配置系统通知，请使用站内通知");
  const permission = await Notification.requestPermission();
  requireCurrentSession(isCurrent);
  if (permission !== "granted")
    throw new Error("没有获得浏览器通知权限，可在浏览器设置中调整");

  const registration = await navigator.serviceWorker.register("/sw.js");
  requireCurrentSession(isCurrent);
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("通知服务加载超时，请重试")), 10_000),
    ),
  ]);
  requireCurrentSession(isCurrent);

  const existing = await registration.pushManager.getSubscription();
  requireCurrentSession(isCurrent);
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  requireCurrentSession(isCurrent);

  await apiRequest("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return true;
}

export async function disablePushSubscription(isCurrent: () => boolean) {
  requireCurrentSession(isCurrent);
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  const registration = await navigator.serviceWorker.getRegistration();
  requireCurrentSession(isCurrent);
  const subscription = await registration?.pushManager.getSubscription();
  requireCurrentSession(isCurrent);
  if (!subscription) return;
  await apiRequest("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  requireCurrentSession(isCurrent);
  await subscription.unsubscribe();
}

/** VAPID 公钥是 URL-safe base64，需转成 Uint8Array 供 pushManager.subscribe 使用 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
