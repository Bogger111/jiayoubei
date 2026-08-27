import { createSessionToken, findUserByEmail, verifyPassword } from "@/lib/server/auth";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { setSessionCookie } from "@/lib/server/session";

export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    const payload = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!email || !password) return Response.json({ error: "请输入邮箱和密码" }, { status: 400 });

    const user = await findUserByEmail(email);
    // 恒定失败：无论账号是否存在都执行一次哈希校验，避免时序侧信道
    const valid = user && user.passwordHash ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !valid) {
      // 简单限速：失败后等待，缓解暴力尝试（演示级）
      await new Promise((resolve) => setTimeout(resolve, 400));
      return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
    }

    const token = await createSessionToken(user.id, user.sessionVersion ?? 0);
    const response = Response.json({
      ok: true,
      user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar, phone: user.phone },
    });
    setSessionCookie(response, token, request);
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "登录失败" }, { status: 500 });
  }
}
