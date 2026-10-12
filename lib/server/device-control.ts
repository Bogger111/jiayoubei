import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { executeDeviceAction } from "@/lib/smart-home";
import { ProductInputError } from "@/lib/product-input";
import { appendAudit, ensureProductSchema } from "./product-repo";
import { isFamilyAdmin, type SessionUser } from "./session";

/** All HTTP entry points share the same family and confirmation checks. */
export async function controlFamilyDevice(
  user: SessionUser,
  identifier: string,
  input: Record<string, unknown>,
) {
  if (!isFamilyAdmin(user))
    throw new ProductInputError("设备操作需要家庭管理员权限", 403);
  await ensureProductSchema();
  const [device] = await getDb()
    .select()
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.familyId, user.familyId),
        or(
          eq(schema.devices.id, identifier),
          eq(schema.devices.haEntity, identifier),
        ),
      ),
    )
    .limit(1);
  if (!device) throw new ProductInputError("设备不存在", 404);
  const protectedDevice = device.kind === "lock" || device.kind === "camera";
  if (
    protectedDevice ||
    input.action !== "light_on" ||
    device.kind !== "lighting" ||
    input.confirmed !== true
  ) {
    const reason = protectedDevice
      ? "门锁和摄像头动作受保护，不能由此接口执行"
      : input.confirmed !== true
        ? "请明确确认本次设备操作"
        : "当前仅支持灯光开启";
    await appendAudit(user.familyId, {
      actor: user.name,
      actorType: "user",
      time: new Date().toISOString(),
      target: device.id,
      action: "拦截设备操作",
      reason,
      riskLevel: protectedDevice ? "critical" : "attention",
      result: "blocked",
    });
    return { status: "blocked" as const, reason };
  }
  const result = await executeDeviceAction({
    action: "light_on",
    entityId: device.haEntity ?? device.id,
    confirmed: true,
  });
  await appendAudit(user.familyId, {
    actor: user.name,
    actorType: "user",
    time: new Date().toISOString(),
    target: device.id,
    action: "请求灯光开启",
    reason: result.status === "success" ? result.result : result.reason,
    riskLevel: "normal",
    result:
      result.status === "blocked"
        ? "blocked"
        : result.status === "failed"
          ? "failed"
          : "success",
  });
  return result;
}
