import { privateJson } from "@/lib/server/json-response";
import { listTasks } from "@/lib/server/product-repo";
import { apiError, requireSession, unauthorized } from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import { createFamilyTask } from "@/lib/server/task-create";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(await listTasks(session.user.familyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    return privateJson(
      await createFamilyTask(session.user, await readObjectBody(request)),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
