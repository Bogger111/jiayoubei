import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { ProductInputError } from "@/lib/product-input";
import { inputText } from "./request-body";
import { ensureProductSchema } from "./product-repo";
import { isFamilyAdmin, type SessionUser } from "./session";
import { createSessionToken, hashPassword } from "./auth";

type InvitationRow = {
  id: string;
  family_id: string;
  member_id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  joined_user_id: string | null;
};
type MemberRow = {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  user_id: string | null;
};
export function requireInvitationMode() {
  if ((env as unknown as { AUTH_MODE?: string }).AUTH_MODE !== "real")
    throw new ProductInputError("邀请加入需要启用账号登录", 403);
}
const emailValue = (value: unknown) => {
  const email = inputText(value, "邮箱", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ProductInputError("邮箱格式不正确");
  return email;
};
async function hashToken(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function allowedFields(input: Record<string, unknown>, fields: string[]) {
  if (Object.keys(input).some((key) => !fields.includes(key)))
    throw new ProductInputError("包含不支持的邀请字段");
}
export async function createInvitation(
  user: SessionUser,
  input: Record<string, unknown>,
) {
  requireInvitationMode();
  if (!isFamilyAdmin(user))
    throw new ProductInputError("邀请成员需要管理员权限", 403);
  allowedFields(input, ["memberId", "email"]);
  await ensureProductSchema();
  const memberId = inputText(input.memberId, "成员", 200);
  const email = emailValue(input.email);
  const database = getDb().$client;
  const member = await database
    .prepare(
      "SELECT id,name,avatar,phone,user_id FROM family_members WHERE id=? AND family_id=?",
    )
    .bind(memberId, user.familyId)
    .first<MemberRow>();
  if (!member) throw new ProductInputError("成员不存在", 404);
  if (member.user_id) throw new ProductInputError("这位成员已有登录账号", 409);
  if (
    await database
      .prepare(
        "SELECT id FROM users WHERE lower(email)=? AND password_hash IS NOT NULL",
      )
      .bind(email)
      .first()
  )
    throw new ProductInputError("该邮箱已有账号，请使用尚未注册的邮箱", 409);
  const token = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const id = `I_${crypto.randomUUID()}`;
  const time = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const result = await database.batch([
    database
      .prepare(
        "UPDATE family_invitations SET revoked_at=? WHERE family_id=? AND member_id=? AND used_at IS NULL AND revoked_at IS NULL",
      )
      .bind(time, user.familyId, memberId),
    database
      .prepare(
        "INSERT INTO family_invitations (id,family_id,member_id,email,token_hash,created_by,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM family_members WHERE id=? AND family_id=? AND user_id IS NULL)",
      )
      .bind(
        id,
        user.familyId,
        memberId,
        email,
        await hashToken(token),
        user.id,
        time,
        expiresAt,
        memberId,
        user.familyId,
      ),
    database
      .prepare(
        "INSERT INTO audit_logs (id,family_id,actor,actor_type,time,target,action,reason,risk_level,result) SELECT ?,?,?,'user',?,?, '生成成员邀请',?,'attention','success' WHERE EXISTS (SELECT 1 FROM family_invitations WHERE id=?)",
      )
      .bind(
        `AL_${crypto.randomUUID()}`,
        user.familyId,
        user.name,
        time,
        memberId,
        `邀请 ${member.name} 建立普通成员账号；有效期 24 小时`,
        id,
      ),
  ]);
  if (result[1].meta.changes !== 1)
    throw new ProductInputError("这位成员已经加入，请更新成员资料", 409);
  return { id, token, expiresAt };
}
export async function listInvitations(user: SessionUser) {
  requireInvitationMode();
  if (!isFamilyAdmin(user))
    throw new ProductInputError("查看邀请需要管理员权限", 403);
  await ensureProductSchema();
  const result = await getDb()
    .$client.prepare(
      "SELECT id,member_id,email,created_at,expires_at,used_at,revoked_at FROM family_invitations WHERE family_id=? ORDER BY created_at DESC LIMIT 200",
    )
    .bind(user.familyId)
    .all();
  return {
    invitations: result.results.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      email: row.email,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: row.used_at
        ? "used"
        : row.revoked_at
          ? "revoked"
          : String(row.expires_at) <= new Date().toISOString()
            ? "expired"
            : "pending",
    })),
  };
}
export async function revokeInvitation(user: SessionUser, id: string) {
  requireInvitationMode();
  if (!isFamilyAdmin(user))
    throw new ProductInputError("撤销邀请需要管理员权限", 403);
  await ensureProductSchema();
  const database = getDb().$client;
  const current = await database
    .prepare(
      "SELECT id,member_id,used_at,revoked_at FROM family_invitations WHERE id=? AND family_id=?",
    )
    .bind(id, user.familyId)
    .first<InvitationRow>();
  if (!current) throw new ProductInputError("邀请不存在", 404);
  if (current.used_at || current.revoked_at)
    throw new ProductInputError("邀请已经使用或撤销", 409);
  const time = new Date().toISOString();
  try {
    const result = await database.batch([
      database
        .prepare(
          "UPDATE family_invitations SET revoked_at=? WHERE id=? AND family_id=? AND used_at IS NULL AND revoked_at IS NULL",
        )
        .bind(time, id, user.familyId),
      database
        .prepare(
          "INSERT INTO audit_logs (id,family_id,actor,actor_type,time,target,action,reason,risk_level,result) SELECT ?,?,?,'user',?,?,'撤销成员邀请','管理员撤销未使用的邀请','attention','success' WHERE EXISTS (SELECT 1 FROM family_invitations WHERE id=? AND family_id=? AND used_at IS NULL AND revoked_at=?)",
        )
        .bind(
          `AL_REVOKE:${id}`,
          user.familyId,
          user.name,
          time,
          current.member_id,
          id,
          user.familyId,
          time,
        ),
    ]);
    if (result[0].meta.changes !== 1)
      throw new ProductInputError("邀请已经使用或撤销", 409);
  } catch (cause) {
    if (cause instanceof ProductInputError) throw cause;
    const latest = await database
      .prepare(
        "SELECT used_at,revoked_at FROM family_invitations WHERE id=? AND family_id=?",
      )
      .bind(id, user.familyId)
      .first<InvitationRow>();
    if (latest?.used_at || latest?.revoked_at)
      throw new ProductInputError("邀请已经使用或撤销", 409);
    throw cause;
  }
  return { ok: true };
}
async function activeInvitation(token: unknown) {
  requireInvitationMode();
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ProductInputError("邀请链接无效或已失效", 410);
  await ensureProductSchema();
  const hash = await hashToken(token);
  const invitation = await getDb()
    .$client.prepare("SELECT * FROM family_invitations WHERE token_hash=?")
    .bind(hash)
    .first<InvitationRow>();
  if (
    !invitation ||
    invitation.used_at ||
    invitation.revoked_at ||
    invitation.expires_at <= new Date().toISOString()
  )
    throw new ProductInputError("邀请链接无效或已失效", 410);
  return invitation;
}
export async function previewInvitation(input: Record<string, unknown>) {
  allowedFields(input, ["token"]);
  const invitation = await activeInvitation(input.token);
  const database = getDb().$client;
  const member = await database
    .prepare(
      "SELECT name,user_id FROM family_members WHERE id=? AND family_id=?",
    )
    .bind(invitation.member_id, invitation.family_id)
    .first<MemberRow>();
  const family = await database
    .prepare("SELECT name FROM families WHERE id=?")
    .bind(invitation.family_id)
    .first<{ name: string }>();
  if (!member || member.user_id || !family)
    throw new ProductInputError("邀请链接无效或已失效", 410);
  return {
    familyName: family.name,
    memberName: member.name,
    expiresAt: invitation.expires_at,
  };
}
export async function acceptInvitation(input: Record<string, unknown>) {
  allowedFields(input, ["token", "email", "password"]);
  const invitation = await activeInvitation(input.token);
  const email = emailValue(input.email);
  if (email !== invitation.email)
    throw new ProductInputError("请填写管理员邀请时指定的邮箱");
  const password = typeof input.password === "string" ? input.password : "";
  if (password.length < 8 || password.length > 128)
    throw new ProductInputError("密码需为 8 至 128 位");
  const database = getDb().$client;
  const member = await database
    .prepare(
      "SELECT id,name,avatar,phone,user_id FROM family_members WHERE id=? AND family_id=?",
    )
    .bind(invitation.member_id, invitation.family_id)
    .first<MemberRow>();
  if (!member || member.user_id)
    throw new ProductInputError("这位成员已经加入或资料已变更", 409);
  if (
    await database
      .prepare(
        "SELECT id FROM users WHERE lower(email)=? AND password_hash IS NOT NULL",
      )
      .bind(email)
      .first()
  )
    throw new ProductInputError("该邮箱已有账号，请联系家庭管理员", 409);
  const userId = `U_${crypto.randomUUID()}`;
  const sessionToken = await createSessionToken(userId);
  const passwordHash = await hashPassword(password);
  const time = new Date().toISOString();
  try {
    const result = await database.batch([
      database
        .prepare(
          "UPDATE family_invitations SET used_at=?,joined_user_id=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM family_members WHERE id=? AND family_id=? AND user_id IS NULL)",
        )
        .bind(
          time,
          userId,
          invitation.id,
          time,
          invitation.member_id,
          invitation.family_id,
        ),
      database
        .prepare(
          "INSERT INTO users (id,name,role,avatar,phone,email,password_hash,family_id) SELECT ?,?,'家庭成员',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM family_invitations WHERE id=? AND joined_user_id=?)",
        )
        .bind(
          userId,
          member.name,
          member.avatar,
          member.phone,
          email,
          passwordHash,
          invitation.family_id,
          invitation.id,
          userId,
        ),
      database
        .prepare(
          "UPDATE family_members SET user_id=? WHERE id=? AND family_id=? AND user_id IS NULL AND EXISTS (SELECT 1 FROM family_invitations WHERE id=? AND joined_user_id=?)",
        )
        .bind(
          userId,
          invitation.member_id,
          invitation.family_id,
          invitation.id,
          userId,
        ),
      database
        .prepare(
          "INSERT INTO audit_logs (id,family_id,actor,actor_type,time,target,action,reason,risk_level,result) SELECT ?,?,?,'user',?,?,'成员接受邀请','创建普通成员账号并关联已有成员资料','attention','success' WHERE EXISTS (SELECT 1 FROM family_invitations WHERE id=? AND joined_user_id=?)",
        )
        .bind(
          `AL_JOIN:${invitation.id}`,
          invitation.family_id,
          member.name,
          time,
          invitation.member_id,
          invitation.id,
          userId,
        ),
    ]);
    if (result[0].meta.changes !== 1)
      throw new ProductInputError("邀请已使用、撤销或失效", 409);
  } catch (cause) {
    if (cause instanceof ProductInputError) throw cause;
    if (
      await database
        .prepare(
          "SELECT id FROM users WHERE lower(email)=? AND password_hash IS NOT NULL",
        )
        .bind(email)
        .first()
    )
      throw new ProductInputError(
        "该邮箱已经创建账号，请登录或联系家庭管理员",
        409,
      );
    throw cause;
  }
  return {
    sessionToken,
    user: { id: userId, name: member.name, role: "家庭成员" },
  };
}
