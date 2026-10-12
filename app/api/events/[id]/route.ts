import { privateJson } from "@/lib/server/json-response";
import { readObjectBody } from "@/lib/server/request-body";
import { findEvent, updateEvent } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const event = await findEvent(session.user.familyId, id);
    if (!event) return privateJson({ error: "事件不存在" }, { status: 404 });
    return privateJson(event);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const patch = await readObjectBody(request);
    const updated = await updateEvent(
      session.user.familyId,
      id,
      patch,
      session.user.name,
    );
    if (!updated) return privateJson({ error: "事件不存在" }, { status: 404 });
    return privateJson(updated);
  } catch (error) {
    return apiError(error);
  }
}
