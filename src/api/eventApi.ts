import type { Event } from "@/lib/product-models";
import { mockEvents } from "@/lib/product-mocks";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";

export const eventApi = {
  async list(): Promise<Event[]> { if (!apiConfig.useMock) return apiRequest("/api/events"); await mockDelay(); return structuredClone(mockEvents); },
  async get(id: string): Promise<Event | undefined> { if (!apiConfig.useMock) return apiRequest(`/api/events/${id}`); await mockDelay(); return structuredClone(mockEvents.find((event) => event.id === id)); },
  async update(id: string, patch: Partial<Event>): Promise<Partial<Event>> { if (!apiConfig.useMock) return apiRequest(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); await mockDelay(120); return { ...(structuredClone(mockEvents.find((event) => event.id === id)) ?? { id }), ...patch }; },
};
