import { requireSession, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session?.user) return unauthorized();
  return Response.json({ user: session.user, needsSetup: session.needsSetup });
}
