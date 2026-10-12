import { privateJson } from "@/lib/server/json-response";
import { readProductState } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(
      await readProductState(session.user.familyId, session.user),
    );
  } catch (error) {
    return apiError(error);
  }
}
