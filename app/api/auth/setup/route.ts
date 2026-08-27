import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { createSessionToken, hashPassword } from "@/lib/server/auth";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { setSessionCookie } from "@/lib/server/session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    // 仅允许在没有任何已设置密码的账号时创建管理员（首次运行）
    const existing = await getDb().select().from(schema.users).where(sql`password_hash IS NOT NULL`).limit(1);
    if (existing.length > 0) {
      return Response.json({ error: "管理员账号已存在" }, { status: 409 });
    }

    const payload = await request.json() as { email?: unknown; password?: unknown; name?: unknown };
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "家庭管理员";

    if (!EMAIL_PATTERN.test(email)) return Response.json({ error: "邮箱格式不正确" }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "密码至少需要 8 位" }, { status: 400 });
    if (password.length > 128) return Response.json({ error: "密码过长" }, { status: 400 });

    // 管理员账号：接管种子用户 U001（奕博）或创建新用户，归属 F001
    const db = getDb();
    const owner = await db.select().from(schema.users).where(sql`id = 'U001'`).limit(1);
    const passwordHash = await hashPassword(password);
    if (owner.length > 0) {
      await db.update(schema.users).set({ email, passwordHash, familyId: "F001", name }).where(sql`id = 'U001'`);
    } else {
      await db.insert(schema.users).values({ id: `U${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name, role: "家庭管理员", avatar: "奕", phone: "", email, passwordHash, familyId: "F001" });
    }

    const userRow = await db.select().from(schema.users).where(sql`email = ${email}`).limit(1);
    const userId = userRow[0]?.id ?? "U001";
    const token = await createSessionToken(userId, userRow[0]?.sessionVersion ?? 0);
    const response = Response.json({ ok: true, user: { id: userId, name, role: "家庭管理员" } });
    setSessionCookie(response, token, request);
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建管理员失败" }, { status: 500 });
  }
}
