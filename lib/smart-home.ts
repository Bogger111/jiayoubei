import type { DeviceState } from "./contracts";
import { readRuntimeEnv } from "./runtime-env";
import { isAlarmState } from "./device-signals";

const isoMinutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export function simulatorSnapshot(): DeviceState[] {
  return [
    {
      id: "binary_sensor.entry_door",
      name: "入户门磁",
      room: "玄关",
      type: "door",
      state: "closed",
      value: "3 小时 12 分钟无开门",
      online: true,
      risk: "attention",
      updatedAt: isoMinutesAgo(192),
      source: "simulator",
    },
    {
      id: "binary_sensor.living_room_presence",
      name: "客厅存在传感器",
      room: "客厅",
      type: "presence",
      state: "clear",
      value: "1 小时 08 分钟无活动",
      online: true,
      risk: "normal",
      updatedAt: isoMinutesAgo(68),
      source: "simulator",
    },
    {
      id: "binary_sensor.smoke",
      name: "烟雾报警器",
      room: "厨房",
      type: "smoke",
      state: "normal",
      value: "未检测到烟雾",
      online: true,
      risk: "normal",
      updatedAt: isoMinutesAgo(2),
      source: "simulator",
    },
    {
      id: "binary_sensor.gas",
      name: "燃气报警器",
      room: "厨房",
      type: "gas",
      state: "normal",
      value: "燃气浓度正常",
      online: true,
      risk: "normal",
      updatedAt: isoMinutesAgo(2),
      source: "simulator",
    },
    {
      id: "sensor.living_room_temperature",
      name: "室内温度",
      room: "客厅",
      type: "temperature",
      state: "26.1",
      value: "26.1",
      unit: "°C",
      online: true,
      risk: "normal",
      updatedAt: isoMinutesAgo(4),
      source: "simulator",
    },
    {
      id: "light.living_room",
      name: "客厅主灯",
      room: "客厅",
      type: "light",
      state: "off",
      value: "已关闭",
      online: true,
      risk: "normal",
      updatedAt: isoMinutesAgo(48),
      source: "simulator",
    },
    {
      id: "media_player.living_room",
      name: "客厅音箱",
      room: "客厅",
      type: "speaker",
      state: "idle",
      value: "在线待机",
      online: true,
      risk: "normal",
      updatedAt: isoMinutesAgo(1),
      source: "simulator",
    },
  ];
}

function configuredForHomeAssistant() {
  return (
    readRuntimeEnv("DEVICE_DRIVER") === "home_assistant" &&
    Boolean(readRuntimeEnv("HOME_ASSISTANT_URL")) &&
    Boolean(readRuntimeEnv("HOME_ASSISTANT_TOKEN"))
  );
}

function classify(entityId: string): DeviceState["type"] {
  if (/door|contact|门磁/i.test(entityId)) return "door";
  if (/presence|motion|occupancy/i.test(entityId)) return "presence";
  if (/smoke/i.test(entityId)) return "smoke";
  if (/gas/i.test(entityId)) return "gas";
  if (/temperature/i.test(entityId)) return "temperature";
  if (entityId.startsWith("light.")) return "light";
  if (entityId.startsWith("media_player.")) return "speaker";
  return "other";
}

function riskFor(
  type: DeviceState["type"],
  state: string,
): DeviceState["risk"] {
  if ((type === "smoke" || type === "gas") && isAlarmState(state))
    return "alarm";
  return "normal";
}

export async function getSmartHomeSnapshot(): Promise<{
  driver: "simulator" | "home_assistant";
  devices: DeviceState[];
  warning?: string;
}> {
  if (!configuredForHomeAssistant())
    return { driver: "simulator", devices: simulatorSnapshot() };

  const baseUrl = readRuntimeEnv("HOME_ASSISTANT_URL").replace(/\/$/, "");
  const token = readRuntimeEnv("HOME_ASSISTANT_TOKEN");
  try {
    const response = await fetch(`${baseUrl}/api/states`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok)
      throw new Error(`Home Assistant returned ${response.status}`);
    const states = (await response.json()) as Array<{
      entity_id: string;
      state: string;
      last_updated: string;
      attributes?: Record<string, unknown>;
    }>;
    const allowedDomains = [
      "binary_sensor.",
      "sensor.",
      "light.",
      "media_player.",
    ];
    const devices = states
      .filter((item) =>
        allowedDomains.some((domain) => item.entity_id.startsWith(domain)),
      )
      .slice(0, 40)
      .map((item): DeviceState => {
        const type = classify(item.entity_id);
        const unit =
          typeof item.attributes?.unit_of_measurement === "string"
            ? item.attributes.unit_of_measurement
            : undefined;
        const friendly =
          typeof item.attributes?.friendly_name === "string"
            ? item.attributes.friendly_name
            : item.entity_id;
        return {
          id: item.entity_id,
          name: friendly,
          room:
            typeof item.attributes?.area_name === "string"
              ? item.attributes.area_name
              : "未分配房间",
          type,
          state: item.state,
          value: `${item.state}${unit ?? ""}`,
          unit,
          online: item.state !== "unavailable" && item.state !== "unknown",
          risk: riskFor(type, item.state),
          updatedAt: item.last_updated,
          source: "home_assistant",
        };
      });
    return { driver: "home_assistant", devices };
  } catch (error) {
    return {
      driver: "simulator",
      devices: simulatorSnapshot(),
      warning:
        error instanceof Error ? error.message : "Home Assistant unavailable",
    };
  }
}

export async function executeDeviceAction(input: {
  action: string;
  entityId?: string;
  message?: string;
  confirmed?: boolean;
}) {
  if (
    input.action === "unlock" ||
    input.entityId?.startsWith("lock.") ||
    input.entityId?.startsWith("camera.")
  ) {
    return {
      status: "blocked" as const,
      reason: "门锁与第三方入户属于高风险动作，家有备禁止自动执行。",
    };
  }
  if (!input.confirmed)
    return {
      status: "blocked" as const,
      reason: "设备动作需要家庭管理员确认。",
    };

  if (input.action !== "light_on" || !input.entityId)
    return {
      status: "blocked" as const,
      reason: "当前仅支持明确指定设备的灯光开启。",
    };

  if (!configuredForHomeAssistant()) {
    if (readRuntimeEnv("AUTH_MODE") === "real")
      return {
        status: "failed" as const,
        reason: "真实设备驱动未连接，指令未发送",
      };
    return {
      status: "success" as const,
      driver: "simulator",
      action: input.action,
      entityId: input.entityId,
      result: "模拟灯光指令已记录，未操作真实设备",
    };
  }

  const baseUrl = readRuntimeEnv("HOME_ASSISTANT_URL").replace(/\/$/, "");
  const token = readRuntimeEnv("HOME_ASSISTANT_TOKEN");
  if (input.action !== "light_on" || !input.entityId?.startsWith("light.")) {
    return {
      status: "blocked" as const,
      reason:
        "真实设备模式当前仅开放灯光开启；音箱播报需在 Home Assistant 中单独配置服务。",
    };
  }
  const response = await fetch(`${baseUrl}/api/services/light/turn_on`, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: input.entityId }),
  });
  if (!response.ok)
    return {
      status: "failed" as const,
      reason: `Home Assistant returned ${response.status}`,
    };
  return {
    status: "success" as const,
    driver: "home_assistant",
    action: input.action,
    entityId: input.entityId,
    result: "Home Assistant 已确认执行",
  };
}
