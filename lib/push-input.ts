import { ProductInputError } from "./product-input.ts";

export function validPushEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trusted =
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.apple.com") ||
      host.endsWith(".notify.windows.com");
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      trusted
    );
  } catch {
    return false;
  }
}
export function pushInput(input: Record<string, unknown>) {
  if (!validPushEndpoint(input.endpoint))
    throw new ProductInputError("当前浏览器的推送服务地址不受支持");
  const keys =
    input.keys && typeof input.keys === "object" && !Array.isArray(input.keys)
      ? (input.keys as Record<string, unknown>)
      : input;
  const key = (value: unknown, bytes: number) => {
    if (
      typeof value !== "string" ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(value) ||
      value.length > 150
    )
      throw new ProductInputError("通知订阅密钥格式不正确");
    try {
      if (atob(value.replace(/-/g, "+").replace(/_/g, "/")).length !== bytes)
        throw new Error();
    } catch {
      throw new ProductInputError("通知订阅密钥格式不正确");
    }
    return value;
  };
  return {
    endpoint: input.endpoint as string,
    p256dh: key(keys.p256dh, 65),
    auth: key(keys.auth, 16),
  };
}
