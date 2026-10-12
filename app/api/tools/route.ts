import { privateJson } from "@/lib/server/json-response";
import type { ToolName } from "@/lib/contracts";
import { executeTool, recentToolRuns } from "@/lib/tool-registry";
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
    return privateJson({ runs: await recentToolRuns(session.user.familyId) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("工具操作需要管理员权限", 403);
    const payload = await readObjectBody(request);
    const tool = inputText(payload.tool, "工具名称", 100) as ToolName;
    if (
      payload.input !== undefined &&
      (!payload.input ||
        typeof payload.input !== "object" ||
        Array.isArray(payload.input))
    )
      throw new ProductInputError("工具输入格式不正确");
    const run = await executeTool(
      session.user,
      tool,
      (payload.input ?? {}) as Record<string, unknown>,
    );
    return privateJson(
      { run },
      {
        status:
          run.status === "blocked" ? 403 : run.status === "failed" ? 502 : 200,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
