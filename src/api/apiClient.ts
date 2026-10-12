type ViteImportMeta = ImportMeta & { env?: Record<string, string | undefined> };
const viteEnv = (import.meta as ViteImportMeta).env ?? {};

export const apiConfig = {
  useMock: (viteEnv.VITE_USE_MOCK ?? "true").toLowerCase() !== "false",
  // 默认同源（部署在 Worker 上时 /api/* 由同一 Worker 提供）；
  // 本地对接独立后端时通过 VITE_API_BASE_URL 覆盖。
  baseURL: (viteEnv.VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(`${apiConfig.baseURL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      let message =
        response.status === 401
          ? "需要重新登录家庭空间"
          : response.status === 403
            ? "当前账号没有此操作权限"
            : "服务暂时不可用，请稍后重试";
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string") message = body.error.slice(0, 240);
      } catch {
        /* An upstream service may return HTML instead of JSON. */
      }
      throw new ApiError(response.status, message);
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error("服务响应超时，请稍后重试");
    throw error;
  }
}

export const mockDelay = (ms = 180) =>
  new Promise((resolve) => setTimeout(resolve, ms));
