import { apiConfig } from "./apiClient";

/**
 * 注册 Service Worker 并订阅 Web Push（真实模式 + HTTPS 下生效）。
 * 浏览器要求 HTTPS（或 localhost）；权限由用户授权，失败静默。
 */
export async function ensurePushSubscription(): Promise<boolean> {
  try {
    if (apiConfig.useMock || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }
    if (!window.isSecureContext) return false;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    if (existing) return true;

    const response = await fetch("/api/push/vapid-key");
    const { publicKey } = (await response.json()) as { publicKey: string };
    if (!publicKey) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    return true;
  } catch {
    return false;
  }
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
