import { privateJson } from "@/lib/server/json-response";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";
import { saveAuthorizationDecision } from "@/lib/server/authorization-write";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("仅家庭管理员可确认高风险授权", 403);
    const { id } = await params;
    const payload = await readObjectBody(request);
    if (payload.decision !== "approve" && payload.decision !== "reject")
      throw new ProductInputError("请明确选择允许或拒绝");
    return privateJson(
      await saveAuthorizationDecision(session.user, id, payload.decision),
    );
  } catch (error) {
    return apiError(error);
  }
}
