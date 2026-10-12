import { privateJson } from "@/lib/server/json-response";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";
import { getDb } from "@/db";
import { ensureProductSchema } from "@/lib/server/product-repo";

const values: Record<string, string[]> = {
  timezone: ["Asia/Shanghai", "Asia/Hong_Kong"],
  ai_style: ["concise", "standard", "caring"],
};
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    await ensureProductSchema();
    const rows = await getDb()
      .$client.prepare(
        "SELECT key, value FROM family_settings WHERE family_id = ?",
      )
      .bind(session.user.familyId)
      .all<{ key: string; value: string }>();
    return privateJson({
      ok: true,
      settings: Object.fromEntries(
        rows.results.map((row) => [row.key, row.value]),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("修改家庭设置需要管理员权限", 403);
    const payload = await readObjectBody(request);
    const settings = payload.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      throw new ProductInputError("设置格式不正确");
    const entries = Object.entries(settings);
    if (!entries.length || entries.length > 2)
      throw new ProductInputError("请提供支持的设置项");
    for (const [key, value] of entries)
      if (typeof value !== "string" || !values[key]?.includes(value))
        throw new ProductInputError("设置项或值不受支持");
    await ensureProductSchema();
    const db = getDb().$client;
    const familyId = session.user.familyId;
    await db.batch(
      entries.map(([key, value]) =>
        db
          .prepare(
            "INSERT INTO family_settings (family_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(family_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
          )
          .bind(familyId, key, value),
      ),
    );
    return privateJson({ ok: true, saved: entries.map(([key]) => key) });
  } catch (error) {
    return apiError(error);
  }
}
