import { privateJson } from "@/lib/server/json-response";
import { markNotificationRead } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    await markNotificationRead(session.user.familyId, session.user.id);
    return privateJson({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
