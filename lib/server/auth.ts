import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import type { User } from "@/lib/product-models";

export const SESSION_COOKIE = "jyb_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600; // 7 天

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function getAuthSecret(): string {
  const secret = (env as unknown as Record<string, unknown>).AUTH_SECRET;
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("AUTH_SECRET 未配置或过短（至少 16 字符）");
  }
  return secret;
}

// ---------------------------------------------------------------------------
// 密码哈希（PBKDF2-SHA256，10 万次迭代；Workers 原生 WebCrypto，无依赖）
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$100000$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromBase64(parts[2]), iterations, hash: "SHA-256" }, key, 256);
    return constantTimeEqual(new Uint8Array(bits), fromBase64(parts[3]));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 无状态会话：base64url(payload).hmac(payload)
// ---------------------------------------------------------------------------

async function sign(data: string): Promise<string> {
  const secret = encoder.encode(getAuthSecret());
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=+$/, "");
}

export async function createSessionToken(userId: string, sessionVersion = 0): Promise<string> {
  const payload = btoa(JSON.stringify({ sub: userId, ver: sessionVersion, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<{ sub: string; ver: number } | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await sign(payload);
  if (!constantTimeEqual(encoder.encode(signature), encoder.encode(expected))) return null;
  try {
    const data = JSON.parse(atob(payload)) as { sub?: unknown; ver?: unknown; exp?: unknown };
    if (typeof data.sub === "string" && typeof data.exp === "number" && data.exp > Date.now()) {
      return { sub: data.sub, ver: typeof data.ver === "number" ? data.ver : 0 };
    }
  } catch {
    // 解析失败视为无效会话
  }
  return null;
}

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function sessionCookieOptions(secure: boolean) {
  return [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(secure ? [`Secure`] : []),
  ].join("; ");
}

export async function findUserByEmail(email: string) {
  const rows = await getDb().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string) {
  const rows = await getDb().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return rows[0] ?? null;
}

export function userToModel(row: typeof schema.users.$inferSelect): User {
  return { id: row.id, name: row.name, role: row.role, avatar: row.avatar, phone: row.phone };
}
