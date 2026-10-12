import { privateJson } from "@/lib/server/json-response";
import { controlFamilyDevice } from "@/lib/server/device-control";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const { id } = await params;
    const result = await controlFamilyDevice(
      session.user,
      id,
      await readObjectBody(request),
    );
    return privateJson(result, {
      status:
        result.status === "blocked"
          ? 403
          : result.status === "failed"
            ? 502
            : 200,
    });
  } catch (error) {
    return apiError(error);
  }
}
