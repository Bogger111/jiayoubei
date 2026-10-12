import { mockAuthorizations, mockAuditLogs, mockDevices, mockEvents, mockFamily, mockMembers, mockNotifications, mockServices, mockTasks, mockUser } from "@/lib/product-mocks";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";
import { type ProductBootstrap, validateProductBootstrap } from "./bootstrapSchema";

export * from "./apiClient";
export * from "./agentApi";
export * from "./authorizationApi";
export * from "./bootstrapSchema";
export * from "./deviceApi";
export * from "./eventApi";
export * from "./familyApi";
export * from "./notificationApi";
export * from "./taskApi";

export async function loadProductState(): Promise<ProductBootstrap> {
  if (!apiConfig.useMock) {
    const payload = await apiRequest<unknown>("/api/bootstrap");
    if (!validateProductBootstrap(payload)) throw new Error("Bootstrap 响应缺少完整产品数据");
    return payload;
  }
  await mockDelay();
  const payload = structuredClone({
    family: mockFamily, user: mockUser, members: mockMembers, events: mockEvents, tasks: mockTasks,
    authorizations: mockAuthorizations, devices: mockDevices, services: mockServices,
    notifications: mockNotifications, auditLogs: mockAuditLogs,
  });
  if (!validateProductBootstrap(payload)) throw new Error("Mock bootstrap 数据无效");
  return payload;
}
