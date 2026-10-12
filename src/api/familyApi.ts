import type { Family, FamilyMember } from "@/lib/product-models";
import { mockFamily, mockMembers } from "@/lib/product-mocks";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";

export const familyApi = {
  async current(): Promise<{ family: Family; members: FamilyMember[] }> {
    if (!apiConfig.useMock) return apiRequest("/api/families/current");
    await mockDelay();
    return structuredClone({ family: mockFamily, members: mockMembers });
  },
};
