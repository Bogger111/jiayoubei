import { privateJson } from "@/lib/server/json-response";
import { apiError, requireSession } from "@/lib/server/session";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { ingestHaEvent } from "@/lib/server/ha-ingest";

const SCENARIOS = {
  wifi: {
    entity_id: "sensor.demo_wifi",
    state: "not_home",
    friendly_name: "林秀兰的手机 Wi-Fi",
    family_member: "林秀兰",
  },
  battery_stop: {
    entity_id: "sensor.demo_battery",
    state: "not_charging",
    friendly_name: "林秀兰的手机充电状态",
    family_member: "林秀兰",
  },
  battery_low: {
    entity_id: "sensor.demo_battery",
    state: "low",
    friendly_name: "林秀兰的手机电量",
    family_member: "林秀兰",
  },
  presence: {
    entity_id: "sensor.demo_presence",
    state: "no_activity",
    friendly_name: "客厅存在传感器",
    family_member: "林秀兰",
  },
  med_taken: {
    entity_id: "binary_sensor.demo_medicine_box",
    state: "taken",
    friendly_name: "智能药盒",
    family_member: "林秀兰",
  },
  med_missed: {
    entity_id: "binary_sensor.demo_medicine_box",
    state: "missed",
    friendly_name: "智能药盒",
    family_member: "林秀兰",
  },
} as const;

type ScenarioKey = keyof typeof SCENARIOS;

/**
 * POST /api/demo/trigger
 * 现场演示用：登录后触发一个"真实传感器样式"的事件（走与 webhook 完全相同的摄取链路：
 * 设备映射 → 风险分级 → 真实 AI 分析 → 事件/时间线/通知/审计落库）。
 * 仅用于演示环境；正式部署应移除或加环境开关。
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user)
      return privateJson({ error: "未登录" }, { status: 401 });
    const familyId = session.user.familyId ?? "F001";

    let body: { scenario?: string };
    try {
      body = (await request.json()) as { scenario?: string };
    } catch {
      body = {};
    }
    const key = (body.scenario ?? "presence") as ScenarioKey;
    if (!(key in SCENARIOS)) {
      return privateJson({ error: "未知场景" }, { status: 400 });
    }

    await ensureProductSchema();
    const result = await ingestHaEvent(SCENARIOS[key], familyId);
    if (!result.ok) return privateJson(result, { status: 400 });
    return privateJson(result);
  } catch (error) {
    return apiError(error);
  }
}
