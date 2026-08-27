import type { ToolName } from "@/lib/contracts";
import { executeTool, recentToolRuns } from "@/lib/tool-registry";

export async function GET() {
  try {
    return Response.json({ runs: await recentToolRuns() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "tool log read failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { tool?: ToolName; input?: Record<string, unknown> };
    if (!payload.tool) return Response.json({ error: "tool is required" }, { status: 400 });
    return Response.json({ run: await executeTool(payload.tool, payload.input ?? {}) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "tool execution failed" }, { status: 500 });
  }
}
