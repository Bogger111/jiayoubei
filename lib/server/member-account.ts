import { getDb } from "@/db";
import { ProductInputError } from "@/lib/product-input";
import { requireInvitationMode } from "./family-invitations";
import { ensureProductSchema } from "./product-repo";
import { isFamilyAdmin, type SessionUser } from "./session";

export async function revokeMemberAccount(user: SessionUser, memberId: string) {
  requireInvitationMode();
  if (!isFamilyAdmin(user))
    throw new ProductInputError("管理账号访问需要管理员权限", 403);
  await ensureProductSchema();
  const db = getDb().$client;
  const member = await db
    .prepare(
      "SELECT m.id,m.name,m.user_id,u.role,u.session_version,u.password_hash FROM family_members m LEFT JOIN users u ON u.id=m.user_id AND u.family_id=m.family_id WHERE m.id=? AND m.family_id=?",
    )
    .bind(memberId, user.familyId)
    .first<{
      id: string;
      name: string;
      user_id: string | null;
      role: string | null;
      session_version: number;
      password_hash: string | null;
    }>();
  if (!member) throw new ProductInputError("成员不存在", 404);
  if (!member.user_id || !member.password_hash)
    throw new ProductInputError("这位成员当前没有可用的登录账号", 409);
  if (member.user_id === user.id || member.role !== "家庭成员")
    throw new ProductInputError(
      "只能停止普通成员的账号访问；管理员账号受保护",
      403,
    );
  const time = new Date().toISOString();
  try {
    const results = await db.batch([
      db
        .prepare(
          "UPDATE users SET password_hash=NULL,session_version=session_version+1,role='已停用' WHERE id=? AND family_id=? AND role='家庭成员' AND password_hash IS NOT NULL AND session_version=? AND EXISTS (SELECT 1 FROM family_members WHERE id=? AND family_id=? AND user_id=?)",
        )
        .bind(
          member.user_id,
          user.familyId,
          member.session_version,
          memberId,
          user.familyId,
          member.user_id,
        ),
      db
        .prepare(
          "UPDATE family_members SET user_id=NULL,online=0 WHERE id=? AND family_id=? AND user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND family_id=? AND role='已停用' AND password_hash IS NULL AND session_version=?)",
        )
        .bind(
          memberId,
          user.familyId,
          member.user_id,
          member.user_id,
          user.familyId,
          member.session_version + 1,
        ),
      db
        .prepare(
          "DELETE FROM push_subscriptions WHERE user_id=? AND family_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND role='已停用' AND password_hash IS NULL)",
        )
        .bind(member.user_id, user.familyId, member.user_id),
      db
        .prepare(
          "UPDATE family_invitations SET revoked_at=? WHERE family_id=? AND member_id=? AND used_at IS NULL AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE id=? AND role='已停用' AND password_hash IS NULL)",
        )
        .bind(time, user.familyId, memberId, member.user_id),
      db
        .prepare(
          "INSERT INTO audit_logs (id,family_id,actor,actor_type,time,target,action,reason,risk_level,result) SELECT ?,?,?,'user',?,?,'停止成员账号访问','停止登录并撤销旧会话及订阅；保留成员资料和已有协作记录','attention','success' WHERE EXISTS (SELECT 1 FROM users WHERE id=? AND family_id=? AND role='已停用' AND password_hash IS NULL AND session_version=?)",
        )
        .bind(
          `AL_ACCOUNT_REVOKE:${member.user_id}`,
          user.familyId,
          user.name,
          time,
          memberId,
          member.user_id,
          user.familyId,
          member.session_version + 1,
        ),
    ]);
    if (results[0].meta.changes !== 1)
      throw new ProductInputError("账号访问已变更，请更新家庭记录", 409);
  } catch (cause) {
    if (cause instanceof ProductInputError) throw cause;
    const latest = await db
      .prepare("SELECT user_id FROM family_members WHERE id=? AND family_id=?")
      .bind(memberId, user.familyId)
      .first<{ user_id: string | null }>();
    if (latest?.user_id !== member.user_id)
      throw new ProductInputError("账号访问已变更，请更新家庭记录", 409);
    throw cause;
  }
  return { ok: true };
}
