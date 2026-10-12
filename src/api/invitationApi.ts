import { apiRequest } from "./apiClient";
import { announceSessionChange } from "@/lib/session-sync";
export type Invitation = {
  id: string;
  memberId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "used" | "revoked" | "expired";
};
export type InvitationPreview = {
  familyName: string;
  memberName: string;
  expiresAt: string;
};
export const invitationApi = {
  revokeAccount: (memberId: string) =>
    apiRequest<{ ok: true }>(
      `/api/members/${encodeURIComponent(memberId)}/account/revoke`,
      { method: "POST" },
    ),
  list: () => apiRequest<{ invitations: Invitation[] }>("/api/invitations"),
  create: (memberId: string, email: string) =>
    apiRequest<{ id: string; token: string; expiresAt: string }>(
      "/api/invitations",
      { method: "POST", body: JSON.stringify({ memberId, email }) },
    ),
  revoke: (id: string) =>
    apiRequest<{ ok: true }>(`/api/invitations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  preview: (token: string, signal?: AbortSignal) =>
    apiRequest<InvitationPreview>("/api/auth/invitations/preview", {
      method: "POST",
      body: JSON.stringify({ token }),
      signal,
    }),
  accept: async (
    token: string,
    email: string,
    password: string,
    signal?: AbortSignal,
  ) => {
    const result = await apiRequest<{ ok: true }>(
      "/api/auth/invitations/accept",
      {
        method: "POST",
        body: JSON.stringify({ token, email, password }),
        signal,
      },
    );
    announceSessionChange();
    return result;
  },
};
