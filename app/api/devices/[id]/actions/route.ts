import { executeDeviceAction } from "@/lib/smart-home";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const payload = await request.json() as { action?: string; message?: string };
    if (!payload.action) return Response.json({ error: "action 是必填项" }, { status: 400 });

    // 复用统一设备驱动：门锁/摄像头永远拦截；真实模式仅开放 light_on；
    // 模拟器模式返回本地成功状态，绝不绕过产品授权边界。
    const result = await executeDeviceAction({ action: payload.action, entityId: id, message: payload.message, confirmed: true });
    const status = result.status === "blocked" ? 403 : result.status === "failed" ? 502 : 200;
    return Response.json(result, { status });
  } catch (error) {
    return apiError(error);
  }
}
