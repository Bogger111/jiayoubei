import { listEvents } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return Response.json(await listEvents(session.user.familyId));
  } catch (error) {
    return apiError(error);
  }
}
