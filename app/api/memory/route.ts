import { privateJson } from "@/lib/server/json-response";
import { addMemory, listMemories, retrieveMemories, updateMemory } from "@/lib/memory-store";
import type { FamilyMemory } from "@/lib/contracts";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";
import { inputText, readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    const query = new URL(request.url).searchParams
      .get("q")
      ?.trim()
      .slice(0, 1000);
    const memories = query
      ? await retrieveMemories(session.user.familyId, query, 8)
      : await listMemories(session.user.familyId);
    return privateJson({ memories, retrieval: query ? "local_rag" : "all" });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("维护家庭记忆需要管理员权限", 403);
    const payload = await readObjectBody(request);
    const content = inputText(payload.content, "记忆内容", 4000);
    const member = inputText(payload.member, "成员名称", 100, true) || "家庭";
    const source =
      inputText(payload.source, "记录来源", 100, true) || "家庭成员补充";
    const type = ["profile", "habit", "event", "preference"].includes(
      String(payload.type),
    )
      ? (payload.type as FamilyMemory["type"])
      : "event";
    const importance =
      typeof payload.importance === "number"
        ? Math.max(1, Math.min(5, Math.round(payload.importance)))
        : 3;
    const memory = await addMemory(session.user.familyId, {
      content,
      member,
      source,
      type,
      importance,
    });
    return privateJson({ memory }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user)) throw new ProductInputError('修改家庭记忆需要管理员权限', 403);
    const payload = await readObjectBody(request);
    if (!Number.isSafeInteger(payload.id) || Number(payload.id) < 1) throw new ProductInputError('请选择一条记忆');
    const content = inputText(payload.content, '记忆内容', 4000);
    if (typeof payload.originalContent !== 'string' || payload.originalContent.length > 4000) throw new ProductInputError('请刷新页面后重新编辑');
    const memory = await updateMemory(session.user.familyId, Number(payload.id), content, payload.originalContent);
    return privateJson({ memory });
  } catch (error) { return apiError(error); }
}
