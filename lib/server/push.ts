import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { validPushEndpoint } from "@/lib/push-input";

/**
 * 向指定家庭的所有推送订阅发送 Web Push 通知。
 * VAPID 密钥来自 Worker secrets；发送失败（订阅过期）时自动清理。
 */
export async function sendPushToFamily(
  familyId: string,
  title: string,
  body: string,
  url = "/",
) {
  const workerEnv = env as unknown as Record<string, unknown>;
  const publicKey = (workerEnv.VAPID_PUBLIC_KEY as string | undefined) ?? "";
  const privateKey = (workerEnv.VAPID_PRIVATE_KEY as string | undefined) ?? "";
  if (!publicKey || !privateKey) return { sent: 0, error: "VAPID 未配置" };

  const rows = await getDb()
    .select()
    .from(schema.pushSubscriptions)
    .where(sqlEqFamily(familyId))
    .all();
  if (rows.length === 0) return { sent: 0, error: "无订阅" };

  const webPush = await importWebPush();
  if (!webPush) return { sent: 0, error: "web-push 不可用" };

  const options = {
    vapidDetails: {
      subject:
        (workerEnv.VAPID_SUBJECT as string) || "mailto:admin@jiayoubei.demo",
      publicKey,
      privateKey,
    },
    TTL: 60,
    timeout: 5000,
  };

  let sent = 0;
  const deadEndpoints: string[] = [];
  const payload = JSON.stringify({ title, body, url });

  await Promise.all(
    rows.map(async (row) => {
      if (!validPushEndpoint(row.endpoint)) return;
      try {
        const subscription = {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        };
        await webPush.sendNotification(subscription, payload, options);
        sent += 1;
      } catch (error) {
        const status =
          error && typeof error === "object" && "statusCode" in error
            ? error.statusCode
            : null;
        // 410/404 = 订阅已失效
        if (status === 410 || status === 404) {
          deadEndpoints.push(row.endpoint);
        }
      }
    }),
  );

  if (deadEndpoints.length > 0) {
    for (const endpoint of deadEndpoints) {
      await getDb()
        .delete(schema.pushSubscriptions)
        .where(and(sqlEqEndpoint(endpoint), sqlEqFamily(familyId)));
    }
  }

  return { sent, cleaned: deadEndpoints.length };
}

function sqlEqFamily(familyId: string) {
  return eq(schema.pushSubscriptions.familyId, familyId);
}
function sqlEqEndpoint(endpoint: string) {
  return eq(schema.pushSubscriptions.endpoint, endpoint);
}

type WebPushModule = {
  default?: unknown;
  sendNotification: (
    subscription: unknown,
    payload: string,
    options: unknown,
  ) => Promise<unknown>;
};

async function importWebPush(): Promise<WebPushModule | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("web-push")) as any;
    if (mod?.sendNotification) return mod as WebPushModule;
    if (mod?.default?.sendNotification) return mod.default as WebPushModule;
    return null;
  } catch {
    return null;
  }
}
