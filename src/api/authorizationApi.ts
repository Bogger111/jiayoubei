import type { Authorization } from "@/lib/product-models";
import { mockAuthorizations } from "@/lib/product-mocks";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";

export const authorizationApi = {
  async decide(id: string, decision: "approve" | "reject"): Promise<Partial<Authorization>> {
    if (!apiConfig.useMock) return apiRequest(`/api/authorizations/${id}/decisions`, { method: "POST", body: JSON.stringify({ decision }) });
    await mockDelay(180);
    return { id, status: decision === "approve" ? "approved" : "rejected" };
  },
  async updatePolicy(id: string, policy: Authorization["policy"]): Promise<Partial<Authorization>> {
    if (!apiConfig.useMock) return apiRequest(`/api/authorizations/${id}`, { method: "PATCH", body: JSON.stringify({ policy }) });
    await mockDelay(120);
    return { ...(structuredClone(mockAuthorizations.find((item) => item.id === id)) ?? { id }), policy };
  },
};
