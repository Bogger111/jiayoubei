import type { Device } from "@/lib/product-models";
import { mockDevices } from "@/lib/product-mocks";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";

export const deviceApi = {
  async list(): Promise<Device[]> { if (!apiConfig.useMock) return apiRequest("/api/devices"); await mockDelay(); return structuredClone(mockDevices); },
  async requestAction(id: string, action: string) { return apiRequest(`/api/devices/${id}/actions`, { method: "POST", body: JSON.stringify({ action }) }); },
};
