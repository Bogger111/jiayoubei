import { privateJson } from "@/lib/server/json-response";
import { revokeInvitation } from "@/lib/server/family-invitations";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(
      await revokeInvitation(session.user, (await context.params).id),
    );
  } catch (cause) {
    return apiError(cause);
  }
}
