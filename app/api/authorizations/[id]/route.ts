import { isAuthorizationPolicyAllowed } from "@/lib/product-policy";
import { appendAudit, findAuthorization, updateAuthorization } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import type { Authorization } from "@/lib/product-models";

const POLICY_VALUES = ["always_allow", "ask_every_time", "always_deny"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const user = session.user;
    const payload = await request.json() as { policy?: string };
    const policy = POLICY_VALUES.includes(payload.policy as Authorization["policy"])
      ? payload.policy as Authorization["policy"]
      : null;
    if (!policy) return Response.json({ error: "policy 必须是 always_allow / ask_every_time / always_deny" }, { status: 400 });

    const auth = await findAuthorization(user.familyId, id);
    if (!auth) return Response.json({ error: "授权规则不存在" }, { status: 404 });

    // 服务端强制高风险边界：Critical/受保护资源不允许 always_allow（与前端一致，且不可绕过）
    if (!isAuthorizationPolicyAllowed(auth, policy)) {
      await appendAudit(user.familyId, {
        actor: "安全规则", actorType: "rule", time: new Date().toISOString(), target: `${id} ${auth.resource}`,
        action: "拦截越权授权规则", reason: "Critical 与受保护资源不能设置为始终允许",
        riskLevel: auth.riskLevel, result: "blocked",
      });
      return Response.json({ error: "该高风险资源不能设置为始终允许" }, { status: 403 });
    }

    await updateAuthorization(user.familyId, id, { policy });
    await appendAudit(user.familyId, {
      actor: user.name, actorType: "user", time: new Date().toISOString(), target: `${id} ${auth.resource}`,
      action: "修改授权规则", reason: "家庭管理员调整长期授权边界",
      riskLevel: auth.riskLevel, result: "success",
    });
    return Response.json({ id, policy });
  } catch (error) {
    return apiError(error);
  }
}
