import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as dbSchema from "@/db/schema";
import {
  SESSION_COOKIE,
  findUserById,
  parseCookie,
  sessionCookieOptions,
  verifySessionToken,
} from "./auth";
import { ensureProductSchema } from "./product-repo";
import type { FamilyMember, User } from "@/lib/product-models";
import { ProductInputError } from "@/lib/product-input";
import { privateJson } from "./json-response";

export type SessionUser = User & { familyId: string; sessionVersion?: number };

export type SessionResult = { user: SessionUser | null; needsSetup: boolean };

/**
 * 当前请求对应的会话用户。
 *
 * AUTH_MODE=demo（默认，单家庭演示模式）：固定返回种子家庭 F001 的家庭管理员。
 *
 * AUTH_MODE=real：校验 jyb_session Cookie（HMAC 签名 + 过期），返回真实登录用户。
 * 未登录返回 null；系统中还没有任何已设置密码的用户时返回 needsSetup=true（首次设置管理员）。
 */
export async function requireSession(
  request: Request,
): Promise<SessionResult | null> {
  const workerEnv = env as unknown as Record<string, unknown>;
  const authMode =
    typeof workerEnv.AUTH_MODE === "string" ? workerEnv.AUTH_MODE : "demo";

  if (authMode !== "real") {
    return {
      user: {
        id: "U001",
        name: "奕博",
        role: "家庭管理员",
        avatar: "奕",
        phone: "138****4206",
        familyId: "F001",
      },
      needsSetup: false,
    };
  }

  // 认证查询依赖 users 表结构；首次访问时先自愈建表（幂等）
  await ensureProductSchema();

  const token = parseCookie(request.headers.get("Cookie"), SESSION_COOKIE);
  const session = token ? await verifySessionToken(token) : null;
  if (session) {
    const row = await findUserById(session.sub);
    if (row?.passwordHash) {
      // 登出/改密会递增 session_version，使旧令牌立即失效
      if ((row.sessionVersion ?? 0) !== session.ver)
        return { user: null, needsSetup: false };
      return {
        user: {
          id: row.id,
          name: row.name,
          role: row.role,
          avatar: row.avatar,
          phone: row.phone,
          familyId: row.familyId ?? "F001",
          sessionVersion: row.sessionVersion ?? 0,
        },
        needsSetup: false,
      };
    }
  }

  // 首次运行：没有任何账号设置过密码 → 需要创建管理员
  const rows = await getDb()
    .select()
    .from(dbSchema.users)
    .where(sql`password_hash IS NOT NULL`)
    .limit(1);
  return { user: null, needsSetup: rows.length === 0 };
}

export function requireFamilyAccess(user: SessionUser, familyId: string) {
  if (user.familyId !== familyId) {
    throw new Error("无权访问其他家庭的数据");
  }
}

/** 是否家庭管理员（阶段 4 将补充细粒度权限）。 */
export function isFamilyAdmin(user: SessionUser) {
  return user.role === "家庭管理员" || user.role === "admin";
}

/** 统一错误响应：不向客户端泄漏内部细节。 */
export function apiError(error: unknown): Response {
  if (error instanceof ProductInputError)
    return privateJson({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "unknown error";
  console.error("[apiError]", error);
  if (message.includes("无权") || message.includes("AUTH_MODE")) {
    return privateJson({ error: message }, { status: 403 });
  }
  return privateJson({ error: "服务器处理失败" }, { status: 500 });
}

/** 未登录响应（真实模式）。 */
export function unauthorized(): Response {
  return privateJson({ error: "未登录" }, { status: 401 });
}

export function setSessionCookie(
  response: Response,
  token: string,
  request?: Request,
) {
  // 仅 HTTPS 请求下发 Secure Cookie；本地 HTTP 开发环境不加，否则浏览器/curl 不会携带
  const secure = request ? new URL(request.url).protocol === "https:" : true;
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; ${sessionCookieOptions(secure)}`,
  );
}

export function clearSessionCookie(response: Response) {
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export type { FamilyMember };
