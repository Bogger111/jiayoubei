import { env } from "cloudflare:workers";

/** GET /api/push/vapid-key — 公开的 VAPID 公钥（设计上即公开），供浏览器订阅用 */
export async function GET() {
  const workerEnv = env as unknown as Record<string, unknown>;
  const publicKey = (workerEnv.VAPID_PUBLIC_KEY as string | undefined) ?? "";
  return Response.json({ publicKey });
}
