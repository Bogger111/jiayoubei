import { listTasks } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return Response.json(await listTasks(session.user.familyId));
  } catch (error) {
    return apiError(error);
  }
}
