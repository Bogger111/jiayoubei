import { addMemory, listMemories, retrieveMemories } from "@/lib/memory-store";
import type { FamilyMemory } from "@/lib/contracts";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim();
    const memories = query ? await retrieveMemories(query, 8) : await listMemories();
    return Response.json({ memories, retrieval: query ? "local_rag" : "all" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "memory read failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Partial<Omit<FamilyMemory, "id" | "createdAt">>;
    if (!payload.content?.trim()) return Response.json({ error: "content is required" }, { status: 400 });
    const type = ["profile", "habit", "event", "preference"].includes(String(payload.type)) ? payload.type as FamilyMemory["type"] : "event";
    const memory = await addMemory({
      member: payload.member?.trim() || "林家",
      type,
      content: payload.content.trim(),
      source: payload.source?.trim() || "家庭成员补充",
      importance: Math.max(1, Math.min(5, Number(payload.importance) || 3)),
    });
    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "memory write failed" }, { status: 500 });
  }
}
