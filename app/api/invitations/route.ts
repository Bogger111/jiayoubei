import { privateJson } from "@/lib/server/json-response";
import {
  createInvitation,
  listInvitations,
} from "@/lib/server/family-invitations";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(await listInvitations(session.user));
  } catch (cause) {
    return apiError(cause);
  }
}
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(
      await createInvitation(session.user, await readObjectBody(request)),
      { status: 201 },
    );
  } catch (cause) {
    return apiError(cause);
  }
}
