import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { getSmartHomeSnapshot } from "@/lib/smart-home";
import { readRuntimeEnv } from "@/lib/runtime-env";
import { ensureProductSchema } from "./product-repo";

export async function getFamilyDeviceSnapshot(familyId: string) {
  await ensureProductSchema();
  if (familyId !== (readRuntimeEnv("HOME_ASSISTANT_FAMILY_ID") || "F001"))
    return {
      driver: "simulator" as const,
      devices: [],
      warning: "当前家庭未配置设备驱动",
    };
  const snapshot = await getSmartHomeSnapshot();
  if (snapshot.driver === "simulator") {
    if (readRuntimeEnv("AUTH_MODE") === "real")
      return {
        ...snapshot,
        devices: [],
        warning: "设备驱动未连接，分析不使用模拟设备状态",
      };
    return snapshot;
  }
  const rows = await getDb()
    .select({ entity: schema.devices.haEntity })
    .from(schema.devices)
    .where(eq(schema.devices.familyId, familyId));
  const entities = new Set(rows.map((row) => row.entity));
  return {
    ...snapshot,
    devices: snapshot.devices.filter((device) => entities.has(device.id)),
  };
}
