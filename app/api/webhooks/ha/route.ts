import { privateJson } from "@/lib/server/json-response";
import { env } from "cloudflare:workers";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { ingestHaEvent, type HaWebhookPayload } from "@/lib/server/ha-ingest";
import { readObjectBody, inputText } from "@/lib/server/request-body";
import { apiError } from "@/lib/server/session";

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
      return privateJson(
        { ok: false, error: "webhook 未配置" },
        { status: 503 },
      );
    }
    const provided = request.headers.get("X-HA-Webhook-Secret") ?? "";
    if (provided !== expected) {
      return privateJson({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await ensureProductSchema();
    const raw = await readObjectBody(request);
    const payload: HaWebhookPayload = {
      entity_id: inputText(raw.entity_id, "设备实体", 256),
      state: inputText(raw.state, "设备状态", 128),
      friendly_name: inputText(raw.friendly_name, "设备名称", 200, true),
      family_member: inputText(raw.family_member, "成员称呼", 100, true),
    };
    const result = await ingestHaEvent(
      payload,
      typeof workerEnv.HOME_ASSISTANT_FAMILY_ID === "string"
        ? workerEnv.HOME_ASSISTANT_FAMILY_ID
        : "F001",
    );
    return privateJson(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return apiError(error);
  }
}
