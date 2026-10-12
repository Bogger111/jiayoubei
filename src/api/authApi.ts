import { apiConfig, apiRequest } from "./apiClient";
import type { User } from "@/lib/product-models";
import { announceSessionChange } from "@/lib/session-sync";

export type AuthUser = User & { familyId: string };

export const authApi = {
  async setupStatus(): Promise<{ needsSetup: boolean; authMode: string }> {
    return apiRequest("/api/auth/setup-status");
  },
  async setup(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ ok: true }> {
    const result = await apiRequest<{ ok: true }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    announceSessionChange();
    return result;
  },
  async login(email: string, password: string): Promise<{ ok: true }> {
    const result = await apiRequest<{ ok: true }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    announceSessionChange();
    return result;
  },
  async logout(): Promise<{ ok: true }> {
    const result = await apiRequest<{ ok: true }>("/api/auth/logout", {
      method: "POST",
    });
    announceSessionChange();
    return result;
  },
  async me(): Promise<{ user: AuthUser; needsSetup: boolean }> {
    return apiRequest("/api/auth/me");
  },
  async changePassword(
    currentPassword: string,
    newPassword: string,
    signal?: AbortSignal,
  ): Promise<{ ok: true }> {
    const result = await apiRequest<{ ok: true }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
      signal,
    });
    announceSessionChange();
    return result;
  },
  // 未启用真实认证时前端不展示登录（demo 模式直接进入）
  get enabled() {
    return !apiConfig.useMock;
  },
};
