import { apiConfig, apiRequest, mockDelay } from "./apiClient";

export const notificationApi = {
  async markRead(id?: string): Promise<{ success: true }> {
    if (!apiConfig.useMock) return apiRequest(id ? `/api/notifications/${id}/read` : "/api/notifications/read-all", { method: "POST" });
    await mockDelay(80);
    return { success: true };
  },
};
