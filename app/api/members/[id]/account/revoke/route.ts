import { privateJson } from "@/lib/server/json-response";
import { revokeMemberAccount } from "@/lib/server/member-account";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const { id } = await params;
    return privateJson(await revokeMemberAccount(session.user, id));
  } catch (cause) {
    return apiError(cause);
  }
}
