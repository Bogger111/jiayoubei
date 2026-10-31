/** Shared-code entrance for the public competition demonstration. */
type DemoEnv = { DB: D1Database; PUBLIC_DEMO_MODE?: string; PUBLIC_DEMO_SIGNING_KEY?: string };
type StoredCode = { salt: string; hash: string; rounds: number };
const scope = "_jiayoubei_public_demo";
const codeKey = "access_code_v1";
const cookieName = "jyb_demo_access";
const encoder = new TextEncoder();
const rounds = 100_000;
const lifetime = 8 * 60 * 60;
const windowMs = 15 * 60 * 1000;
const maxFailures = 8;
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unbase64 = (value: string) => Uint8Array.from(atob(value), ch => ch.charCodeAt(0));

async function hashCode(code: string, salt: Uint8Array, count: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(code), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt), iterations: count }, key, 256));
}
async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function equalBytes(a: Uint8Array, b: Uint8Array) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
async function validCookie(request: Request, secret: string) {
  const raw = request.headers.get("Cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3 || !/^\d{10}$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1])) return false;
  const expires = Number(parts[0]);
  if (expires <= Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + lifetime + 5) return false;
  return equalBytes(encoder.encode(parts[2]), encoder.encode(await signature(secret, parts[0] + "." + parts[1])));
}
async function sessionCookie(request: Request, secret: string) {
  const payload = (Math.floor(Date.now() / 1000) + lifetime) + "." + crypto.randomUUID().replaceAll("-", "");
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=${payload}.${await signature(secret, payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetime}${secure}`;
}
function htmlPage(setup: boolean, message = "", status = 200) {
  const title = setup ? "设置评委访问码" : "欢迎来到家有备";
  const explanation = setup ? "为比赛演示创建一个统一访问码，之后分享给评委。" : "输入演示访问码，进入你的家庭助手。";
  const repeat = setup ? '<label for="confirm">再次输入访问码</label><input id="confirm" name="confirm" type="password" minlength="12" maxlength="128" required autocomplete="new-password">' : "";
  const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · 家有备</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f7f3;color:#172d27;font:16px/1.5 system-ui,-apple-system,"Microsoft YaHei",sans-serif}.panel{width:min(100%,430px);background:white;border:1px solid #dbe4dc;border-radius:24px;padding:40px;box-shadow:0 20px 60px #183b2910}.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#e8f0e8;color:#24584c;font-size:19px}h1{font-size:29px;letter-spacing:-.04em;margin:35px 0 8px}p{color:#667a70;margin:0 0 28px}label{display:block;font-weight:600;font-size:14px;margin:18px 0 8px}input{width:100%;height:48px;border:1px solid #b8cbc0;border-radius:12px;padding:0 14px;font:inherit;background:#fff;color:#172d27}input:focus{outline:3px solid #b8d8c7;border-color:#235749}button{width:100%;height:48px;border:0;border-radius:12px;margin-top:24px;color:white;background:#214f42;font:600 15px system-ui;cursor:pointer}button:hover{background:#173e33}.hint{font-size:13px;color:#71847a;margin:10px 0 0}.error{font-size:14px;color:#a8322d;margin:12px 0 0}.footer{font-size:12px;color:#8b9a91;margin:26px 0 0}@media(max-width:480px){.panel{padding:28px}}
  </style></head><body><main class="panel"><div class="brand"><span class="mark">⌂</span>家有备</div><h1>${title}</h1><p>${explanation}</p><form method="post" action="${setup ? "/__demo/setup" : "/__demo/unlock"}"><label for="code">访问码</label><input id="code" name="code" type="password" minlength="12" maxlength="128" required autofocus autocomplete="${setup ? "new-password" : "current-password"}">${repeat}${setup ? '<div class="hint">请使用 12—128 位英文字母、数字或符号。</div>' : ""}${message ? `<div class="error" role="alert">${message}</div>` : ""}<button type="submit">${setup ? "设置并进入" : "进入家有备"}</button></form><div class="footer">家庭协作 · 空间 · 记忆</div></main></body></html>`;
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "Referrer-Policy": "same-origin", "X-Content-Type-Options": "nosniff" } });
}
async function readForm(request: Request): Promise<URLSearchParams | null> {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return null;
  if (Number(request.headers.get("content-length") ?? 0) > 2048 || !request.body) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 2048) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}
async function storedCode(db: D1Database): Promise<StoredCode | null> {
  const row = await db.prepare("SELECT value FROM family_settings WHERE family_id=? AND key=?").bind(scope, codeKey).first<{ value: string }>();
  return row ? JSON.parse(row.value) as StoredCode : null;
}
async function failureKey(request: Request, secret: string) {
  return "failure_" + (await signature(secret, request.headers.get("CF-Connecting-IP") ?? "unknown")).slice(0, 32);
}
async function failureState(db: D1Database, key: string) {
  const row = await db.prepare("SELECT value FROM family_settings WHERE family_id=? AND key=?").bind(scope, key).first<{ value: string }>();
  if (!row) return { since: Date.now(), count: 0 };
  const state = JSON.parse(row.value) as { since: number; count: number };
  return Date.now() - state.since >= windowMs ? { since: Date.now(), count: 0 } : state;
}
function rejectApi() {
  return new Response(JSON.stringify({ error: "请输入演示访问码" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
/** Return null only when the application may process the request. */
export async function publicDemoGate(request: Request, env: DemoEnv): Promise<Response | null> {
  const mode = env.PUBLIC_DEMO_MODE;
  if (!mode) return null;
  if (!["bootstrap", "enabled"].includes(mode) || !env.PUBLIC_DEMO_SIGNING_KEY || env.PUBLIC_DEMO_SIGNING_KEY.length < 32)
    return new Response("演示入口暂不可用", { status: 503, headers: { "Cache-Control": "no-store" } });
  const secret = env.PUBLIC_DEMO_SIGNING_KEY, url = new URL(request.url);
  try {
    if (!url.pathname.startsWith("/__demo/") && await validCookie(request, secret)) return null;
    const stored = await storedCode(env.DB);
    if (url.pathname === "/__demo/status") {
      if (mode !== "bootstrap") return new Response("Not found", { status: 404 });
      return Response.json({ configured: !!stored }, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/__demo/setup") {
      if (mode !== "bootstrap" || stored) return new Response("Not found", { status: 404 });
      if (request.method === "GET") return htmlPage(true);
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return htmlPage(true, "请返回并重新输入访问码。", 403);
      const form = await readForm(request), code = form?.get("code") ?? "";
      if (!/^[\x21-\x7e]{12,128}$/.test(code) || form?.get("confirm") !== code) return htmlPage(true, "请检查访问码格式，并确保两次输入一致。", 400);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const record: StoredCode = { salt: base64(salt), hash: base64(await hashCode(code, salt, rounds)), rounds };
      const result = await env.DB.prepare("INSERT OR IGNORE INTO family_settings(family_id,key,value,updated_at) VALUES(?,?,?,datetime('now'))").bind(scope, codeKey, JSON.stringify(record)).run();
      if (!result.meta.changes) return htmlPage(false, "访问码已经设置，请使用已有访问码进入。", 409);
      return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": await sessionCookie(request, secret), "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/__demo/unlock") {
      if (!stored) return mode === "bootstrap" ? htmlPage(true) : new Response("演示入口暂不可用", { status: 503 });
      if (request.method === "GET") return htmlPage(false);
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return htmlPage(false, "请返回并重新输入访问码。", 403);
      const key = await failureKey(request, secret), failures = await failureState(env.DB, key);
      if (failures.count >= maxFailures) return htmlPage(false, "尝试次数过多，请稍后再试。", 429);
      const form = await readForm(request), code = form?.get("code") ?? "";
      let valid = false;
      if (/^[\x21-\x7e]{12,128}$/.test(code) && stored.rounds === rounds) valid = equalBytes(await hashCode(code, unbase64(stored.salt), stored.rounds), unbase64(stored.hash));
      if (!valid) {
        await env.DB.prepare(`INSERT INTO family_settings(family_id,key,value,updated_at) VALUES(?,?,?,datetime('now'))
          ON CONFLICT(family_id,key) DO UPDATE SET value=CASE
          WHEN CAST(json_extract(family_settings.value,'$.since') AS INTEGER) <= ?
          THEN excluded.value ELSE json_set(family_settings.value,'$.count',COALESCE(json_extract(family_settings.value,'$.count'),0)+1) END,
          updated_at=excluded.updated_at`).bind(scope, key, JSON.stringify({ since: Date.now(), count: 1 }), Date.now() - windowMs).run();
        return htmlPage(false, "访问码不正确，请重试。", 401);
      }
      await env.DB.prepare("DELETE FROM family_settings WHERE family_id=? AND key=?").bind(scope, key).run();
      return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": await sessionCookie(request, secret), "Cache-Control": "no-store" } });
    }
    if (url.pathname.startsWith("/api/") || request.method !== "GET") return rejectApi();
    if (!stored && mode !== "bootstrap") return new Response("演示入口暂不可用", { status: 503, headers: { "Cache-Control": "no-store" } });
    return htmlPage(!stored);
  } catch {
    return new Response("演示入口暂不可用，请稍后再试。", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
