import { executeDeviceAction, getSmartHomeSnapshot } from "@/lib/smart-home";

export async function GET() {
  return Response.json(await getSmartHomeSnapshot());
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { action?: string; entityId?: string; message?: string; confirmed?: boolean };
    if (!payload.action) return Response.json({ error: "action is required" }, { status: 400 });
    const result = await executeDeviceAction({ action: payload.action, entityId: payload.entityId, message: payload.message, confirmed: payload.confirmed });
    return Response.json(result, { status: result.status === "blocked" ? 403 : result.status === "failed" ? 502 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "device action failed" }, { status: 500 });
  }
}
