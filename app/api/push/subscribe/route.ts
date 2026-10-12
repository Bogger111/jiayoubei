import { privateJson } from "@/lib/server/json-response";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { pushInput } from "@/lib/push-input";
import { readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";
import { getDb } from "@/db";

/** POST /api/push/subscribe — 保存当前用户的 Web Push 订阅 */
export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const { endpoint, p256dh, auth } = pushInput(await readObjectBody(request));
    const db = getDb().$client;
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(endpoint),
    );
    const id = `PS_${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const existing = await db
      .prepare(
        "SELECT id,user_id,family_id FROM push_subscriptions WHERE endpoint=? LIMIT 1",
      )
      .bind(endpoint)
      .first<{ id: string; user_id: string; family_id: string }>();
    if (
      existing &&
      (existing.user_id !== session.user.id ||
        existing.family_id !== session.user.familyId)
    )
      throw new ProductInputError(
        "此浏览器已有其他账号订阅，请先关闭并重新开启浏览器通知",
        409,
      );
    const saved = await db
      .prepare(
        "INSERT INTO push_subscriptions (id,user_id,family_id,endpoint,p256dh,auth,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent WHERE push_subscriptions.user_id=excluded.user_id AND push_subscriptions.family_id=excluded.family_id RETURNING id",
      )
      .bind(
        existing?.id ?? id,
        session.user.id,
        session.user.familyId,
        endpoint,
        p256dh,
        auth,
        request.headers.get("User-Agent")?.slice(0, 200) ?? "",
        new Date().toISOString(),
      )
      .first();
    if (!saved)
      throw new ProductInputError(
        "此浏览器的订阅归属已变化，请重新开启通知",
        409,
      );
    return privateJson({ ok: true, updated: true });
  } catch (error) {
    return apiError(error);
  }
}
