import { privateJson } from "@/lib/server/json-response";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";
import { saveAuthorizationPolicy } from "@/lib/server/authorization-write";
import type { Authorization } from "@/lib/product-models";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("仅家庭管理员可修改授权规则", 403);
    const { id } = await params;
    const payload = await readObjectBody(request);
    if (
      !["always_allow", "ask_every_time", "always_deny"].includes(
        String(payload.policy),
      )
    )
      throw new ProductInputError("授权规则格式不正确");
    return privateJson(
      await saveAuthorizationPolicy(
        session.user,
        id,
        payload.policy as Authorization["policy"],
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
