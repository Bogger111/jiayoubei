import { appendAudit, findAuthorization, updateAuthorization } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const user = session.user;
    const payload = await request.json() as { decision?: string };
    const decision = payload.decision === "approve" ? "approve" : payload.decision === "reject" ? "reject" : null;
    if (!decision) return Response.json({ error: "decision 必须是 approve 或 reject" }, { status: 400 });

    const auth = await findAuthorization(user.familyId, id);
    if (!auth) return Response.json({ error: "授权请求不存在" }, { status: 404 });
    if (auth.status !== "pending") return Response.json({ error: "该授权请求已处理" }, { status: 409 });

    const now = new Date().toISOString();
    const status = decision === "approve" ? "approved" : "rejected";
    await updateAuthorization(user.familyId, id, { status });
    await appendAudit(user.familyId, {
      actor: user.name, actorType: "user", time: now, target: `${id} ${auth.resource}`,
      action: decision === "approve" ? "允许本次操作" : "拒绝高风险操作",
      reason: auth.reason, riskLevel: auth.riskLevel, result: decision === "approve" ? "success" : "blocked",
    });
    return Response.json({ id, status });
  } catch (error) {
    return apiError(error);
  }
}
