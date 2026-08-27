import { env } from "cloudflare:workers";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { ingestHaEvent, type HaWebhookPayload } from "@/lib/server/ha-ingest";

/**
 * POST /api/webhooks/ha
 * Home Assistant 自动化上报真实传感器事件。
 * 鉴权：X-HA-Webhook-Secret 头必须等于 Worker secret HA_WEBHOOK_SECRET。
 * 失败时不向 HA 泄露内部细节，仅返回通用错误。
 */
export async function POST(request: Request) {
  try {
    const workerEnv = env as unknown as Record<string, unknown>;
    const expected = (workerEnv.HA_WEBHOOK_SECRET as string | undefined) ?? "";
    if (!expected) {
      return Response.json({ ok: false, error: "webhook 未配置" }, { status: 503 });
    }
    const provided = request.headers.get("X-HA-Webhook-Secret") ?? "";
    if (provided !== expected) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await ensureProductSchema();
    const payload = (await request.json()) as HaWebhookPayload;
    const result = await ingestHaEvent(payload, "F001");
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    return Response.json({ ok: false, error: "服务器处理失败" }, { status: 500 });
  }
}
