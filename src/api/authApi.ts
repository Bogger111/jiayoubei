import { apiConfig, apiRequest } from "./apiClient";
import type { User } from "@/lib/product-models";

export type AuthUser = User & { familyId: string };

export const authApi = {
  async setupStatus(): Promise<{ needsSetup: boolean; authMode: string }> {
    return apiRequest("/api/auth/setup-status");
  },
  async setup(email: string, password: string, name?: string): Promise<{ ok: true }> {
    return apiRequest("/api/auth/setup", { method: "POST", body: JSON.stringify({ email, password, name }) });
  },
  async login(email: string, password: string): Promise<{ ok: true }> {
    return apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  },
  async logout(): Promise<{ ok: true }> {
    return apiRequest("/api/auth/logout", { method: "POST" });
  },
  async me(): Promise<{ user: AuthUser; needsSetup: boolean }> {
    return apiRequest("/api/auth/me");
  },
  // 未启用真实认证时前端不展示登录（demo 模式直接进入）
  get enabled() {
    return !apiConfig.useMock;
  },
};
