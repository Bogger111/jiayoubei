import { currentFamily } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const result = await currentFamily(session.user.familyId);
    if (!result) return Response.json({ error: "家庭不存在" }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
