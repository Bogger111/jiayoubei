import { privateJson } from "@/lib/server/json-response";
import { getDb } from "@/db";
import { createSessionToken, hashPassword } from "@/lib/server/auth";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { apiError, setSessionCookie } from "@/lib/server/session";
import { inputText, readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    const database = getDb().$client;
    const existing = await database
      .prepare("SELECT id FROM users WHERE password_hash IS NOT NULL LIMIT 1")
      .first();
    if (existing) throw new ProductInputError("管理员账号已存在", 409);
    const payload = await readObjectBody(request);
    const email = inputText(payload.email, "邮箱", 254).toLowerCase();
    const name = inputText(payload.name, "姓名", 100, true) || "家庭管理员";
    const password =
      typeof payload.password === "string" ? payload.password : "";
    if (password.length > 128) throw new ProductInputError("密码过长");
    if (!emailPattern.test(email))
      throw new ProductInputError("邮箱格式不正确");
    if (password.length < 8) throw new ProductInputError("密码至少需要 8 位");
    const owner = await database
      .prepare(
        "SELECT id, session_version AS version FROM users WHERE id='U001'",
      )
      .first<{ id: string; version: number }>();
    const id = owner?.id ?? `U_${crypto.randomUUID()}`;
    // Validate signing configuration before creating the first account.
    await createSessionToken(id, owner?.version ?? 0);
    const hash = await hashPassword(password);
    const created = await database
      .prepare(
        `INSERT INTO users (id, name, role, avatar, phone, email, password_hash, family_id)
      SELECT ?, ?, '家庭管理员', ?, '', ?, ?, 'F001'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE password_hash IS NOT NULL)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, avatar=excluded.avatar, email=excluded.email, password_hash=excluded.password_hash, family_id=excluded.family_id
      WHERE users.password_hash IS NULL
      RETURNING id, session_version AS version`,
      )
      .bind(id, name, name.slice(0, 1), email, hash)
      .first<{ id: string; version: number }>();
    if (!created) throw new ProductInputError("管理员账号已存在", 409);
    const token = await createSessionToken(created.id, created.version);
    const response = privateJson({
      ok: true,
      user: { id: created.id, name, role: "家庭管理员" },
    });
    setSessionCookie(response, token, request);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
