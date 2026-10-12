import { privateJson } from "@/lib/server/json-response";
import {
  acceptInvitation,
  requireInvitationMode,
} from "@/lib/server/family-invitations";
import {
  apiError,
  setSessionCookie,
  requireSession,
} from "@/lib/server/session";
import { ProductInputError } from "@/lib/product-input";
import { readObjectBody } from "@/lib/server/request-body";
export async function POST(request: Request) {
  try {
    requireInvitationMode();
    const session = await requireSession(request);
    if (session?.user)
      throw new ProductInputError("请先退出当前账号，再接受邀请", 409);
    const result = await acceptInvitation(await readObjectBody(request));
    const response = privateJson({ ok: true, user: result.user });
    setSessionCookie(response, result.sessionToken, request);
    return response;
  } catch (cause) {
    return apiError(cause);
  }
}
