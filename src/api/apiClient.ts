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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiConfig.baseURL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new ApiError(response.status, `API ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export const mockDelay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
