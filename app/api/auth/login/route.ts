import { privateJson } from "@/lib/server/json-response";
import {
  createSessionToken,
  findUserByEmail,
  verifyPassword,
} from "@/lib/server/auth";
import { readObjectBody } from "@/lib/server/request-body";
import { ensureProductSchema } from "@/lib/server/product-repo";
import { apiError, setSessionCookie } from "@/lib/server/session";

export async function POST(request: Request) {
  try {
    await ensureProductSchema();
    const payload = await readObjectBody(request);
    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";
    const password =
      typeof payload.password === "string" ? payload.password : "";
    if (!email || !password || email.length > 254 || password.length > 128)
      return privateJson({ error: "请输入邮箱和密码" }, { status: 400 });

    const user = await findUserByEmail(email);
    // Missing accounts still perform the same PBKDF2 operation before failing.
    const dummyHash =
      "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !valid) {
      // 简单限速：失败后等待，缓解暴力尝试（演示级）
      await new Promise((resolve) => setTimeout(resolve, 400));
      return privateJson({ error: "邮箱或密码不正确" }, { status: 401 });
    }

    const token = await createSessionToken(user.id, user.sessionVersion ?? 0);
    const response = privateJson({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
      },
    });
    setSessionCookie(response, token, request);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
