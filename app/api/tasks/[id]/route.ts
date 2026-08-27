import { findTask, updateTask } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const task = await findTask(session.user.familyId, id);
    if (!task) return Response.json({ error: "任务不存在" }, { status: 404 });
    return Response.json(task);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const patch = await request.json() as Record<string, unknown>;
    const updated = await updateTask(session.user.familyId, id, patch);
    if (!updated) return Response.json({ error: "任务不存在" }, { status: 404 });
    return Response.json(updated);
  } catch (error) {
    return apiError(error);
  }
}
