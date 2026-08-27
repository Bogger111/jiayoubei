import { markNotificationRead } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    await markNotificationRead(session.user.familyId);
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
