import { requireSession } from "@/lib/server/session";

/** GET /api/settings — 读取家庭设置（KV） */
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
  const familyId = session.user.familyId;
  try {
    const { getDb } = await import("@/db");
    const db = getDb();
    const rows = await db.$client.prepare("SELECT key, value FROM family_settings WHERE family_id = ?").bind(familyId).all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const r of rows.results) settings[r.key] = r.value;
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取设置失败" }, { status: 500 });
  }
}

/** PUT /api/settings — 保存家庭设置 */
export async function PUT(request: Request) {
  const session = await requireSession(request);
  if (!session?.user) return Response.json({ error: "未登录" }, { status: 401 });
  const familyId = session.user.familyId;
  try {
    const payload = await request.json() as { settings?: Record<string, string> };
    const settings = payload.settings ?? {};
    const { getDb } = await import("@/db");
    const db = getDb();
    const stmt = db.$client.prepare(
      "INSERT INTO family_settings (family_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(family_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    );
    for (const [key, value] of Object.entries(settings)) {
      await stmt.bind(familyId, key, String(value ?? "")).run();
    }
    return Response.json({ ok: true, saved: Object.keys(settings) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存设置失败" }, { status: 500 });
  }
}
