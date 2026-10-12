import type { Task } from "@/lib/product-models";
import { mockTasks } from "@/lib/product-mocks";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";

export const taskApi = {
  async list(): Promise<Task[]> { if (!apiConfig.useMock) return apiRequest("/api/tasks"); await mockDelay(); return structuredClone(mockTasks); },
  async update(id: string, patch: Partial<Task>): Promise<Partial<Task>> { if (!apiConfig.useMock) return apiRequest(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); await mockDelay(120); return { ...(structuredClone(mockTasks.find((task) => task.id === id)) ?? { id }), ...patch }; },
};
