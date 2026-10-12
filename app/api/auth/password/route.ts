import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { privateJson } from "@/lib/server/json-response";
import {
  apiError,
  requireSession,
  setSessionCookie,
  unauthorized,
} from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import {
  createSessionToken,
  findUserById,
  hashPassword,
  verifyPassword,
} from "@/lib/server/auth";
import { ProductInputError } from "@/lib/product-input";

export async function POST(request: Request) {
  try {
    if ((env as unknown as { AUTH_MODE?: string }).AUTH_MODE !== "real")
      throw new ProductInputError("更新登录密码需要启用账号登录", 403);
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const input = await readObjectBody(request);
    if (
      Object.keys(input).some(
        (key) => !["currentPassword", "newPassword"].includes(key),
      )
    )
      throw new ProductInputError("包含不支持的账号字段");
    const { currentPassword, newPassword } = input;
    if (
      typeof currentPassword !== "string" ||
      !currentPassword ||
      currentPassword.length > 128
    )
      throw new ProductInputError("请填写当前密码");
    if (
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      newPassword.length > 128 ||
      !newPassword.trim()
    )
      throw new ProductInputError("新密码应为 8 至 128 位");
    if (currentPassword === newPassword)
      throw new ProductInputError("新密码应与当前密码不同");
    const user = await findUserById(session.user.id);
    if (
      !user?.passwordHash ||
      (user.familyId ?? "F001") !== session.user.familyId ||
      (user.sessionVersion ?? 0) !== session.user.sessionVersion
    )
      return unauthorized();
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      throw new ProductInputError("当前密码不正确");
    const version = user.sessionVersion ?? 0;
    const hash = await hashPassword(newPassword);
    const token = await createSessionToken(user.id, version + 1);
    const database = getDb().$client;
    const auditId = `AL_PASSWORD:${user.id}:${version}`;
    const results = await database.batch([
      database
        .prepare(
          `INSERT INTO audit_logs (id,family_id,actor,actor_type,time,target,action,reason,risk_level,result)
        SELECT ?,?,?, 'user',?,?, '更新登录密码','本人验证当前密码后更新，撤销旧登录会话与通知订阅','attention','success'
        FROM users WHERE id=? AND password_hash=? AND session_version=?`,
        )
        .bind(
          auditId,
          session.user.familyId,
          user.name,
          new Date().toISOString(),
          user.id,
          user.id,
          user.passwordHash,
          version,
        ),
      database
        .prepare(
          "UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=? AND password_hash=? AND session_version=? RETURNING id",
        )
        .bind(hash, user.id, user.passwordHash, version),
      database
        .prepare(
          "DELETE FROM push_subscriptions WHERE user_id=? AND family_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND password_hash=? AND session_version=?)",
        )
        .bind(user.id, session.user.familyId, user.id, hash, version + 1),
    ]);
    if (!results[1].results.length)
      throw new ProductInputError("登录或密码已更新，请重新登录后重试", 409);
    const response = privateJson({ ok: true });
    setSessionCookie(response, token, request);
    return response;
  } catch (cause) {
    return apiError(cause);
  }
}
