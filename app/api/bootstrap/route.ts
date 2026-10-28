import { privateJson } from "@/lib/server/json-response";
import { readProductState } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { latestCarePlan } from "@/lib/server/care-service";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(
      { ...await readProductState(session.user.familyId, session.user), carePlan: await latestCarePlan(session.user.familyId) },
    );
  } catch (error) {
    return apiError(error);
  }
}
