import { privateJson } from "@/lib/server/json-response";
import { getFamilyDeviceSnapshot } from "@/lib/server/device-snapshot";
import { controlFamilyDevice } from "@/lib/server/device-control";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { inputText, readObjectBody } from "@/lib/server/request-body";
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(await getFamilyDeviceSnapshot(session.user.familyId));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const input = await readObjectBody(request);
    const result = await controlFamilyDevice(
      session.user,
      inputText(input.entityId, "设备标识", 200),
      input,
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
