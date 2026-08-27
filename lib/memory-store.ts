import { env } from "cloudflare:workers";
import type { FamilyMemory } from "./contracts";

const defaultMemories = [
  { member: "林秀兰", type: "profile", content: "68 岁，独居，高血压，每日 08:00 服用降压药，对青霉素过敏。", source: "家庭档案", importance: 5 },
  { member: "林秀兰", type: "habit", content: "通常在 13:00–14:30 午休，午休时偶尔会将手机调成静音。", source: "家庭习惯", importance: 4 },
  { member: "林秀兰", type: "habit", content: "正常情况下，家人发消息后约 30 分钟内会回复。", source: "联系习惯", importance: 5 },
  { member: "林秀兰", type: "event", content: "上一次未接电话是因为午睡和手机静音，邻居王阿姨在 6 分钟内完成上门确认。", source: "历史事件", importance: 4 },
  { member: "林家", type: "preference", content: "低风险时先使用低打扰消息；联系邻居、共享健康信息和专业救援前必须由家庭管理员确认。", source: "家庭授权", importance: 5 },
] as const;

function db(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  return binding;
}

export async function ensureProductSchema() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS family_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS tool_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS memories_member_idx ON family_memories(member)"),
    database.prepare("CREATE INDEX IF NOT EXISTS tool_runs_created_idx ON tool_runs(created_at)"),
  ]);

  const count = await database.prepare("SELECT COUNT(*) AS count FROM family_memories").first<{ count: number }>();
  if (Number(count?.count ?? 0) === 0) {
    await database.batch(defaultMemories.map((memory) => database
      .prepare("INSERT INTO family_memories (member, type, content, source, importance) VALUES (?, ?, ?, ?, ?)")
      .bind(memory.member, memory.type, memory.content, memory.source, memory.importance)));
  }
}

export async function listMemories(): Promise<FamilyMemory[]> {
  await ensureProductSchema();
  const result = await db().prepare(`SELECT id, member, type, content, source, importance,
    created_at AS createdAt FROM family_memories ORDER BY importance DESC, id ASC`).all<FamilyMemory>();
  return result.results ?? [];
}

export async function addMemory(input: Omit<FamilyMemory, "id" | "createdAt">): Promise<FamilyMemory> {
  await ensureProductSchema();
  const result = await db().prepare(`INSERT INTO family_memories
    (member, type, content, source, importance) VALUES (?, ?, ?, ?, ?)
    RETURNING id, member, type, content, source, importance, created_at AS createdAt`)
    .bind(input.member, input.type, input.content, input.source, input.importance)
    .first<FamilyMemory>();
  if (!result) throw new Error("memory insert failed");
  return result;
}

function terms(text: string) {
  const normalized = text.toLowerCase().replace(/[，。！？、：；,.!?\s]/g, "");
  const values = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) values.add(normalized.slice(i, i + 2));
  ["母亲", "妈妈", "老人", "回复", "电话", "午休", "静音", "独居", "用药", "邻居", "授权", "失联", "门磁", "活动"].forEach((term) => {
    if (text.includes(term)) values.add(term);
  });
  return values;
}

export async function retrieveMemories(query: string, limit = 4): Promise<FamilyMemory[]> {
  const memories = await listMemories();
  const queryTerms = terms(query);
  return memories
    .map((memory) => {
      const memoryTerms = terms(`${memory.member}${memory.type}${memory.content}`);
      let overlap = 0;
      queryTerms.forEach((term) => { if (memoryTerms.has(term)) overlap += term.length > 2 ? 3 : 1; });
      if (/妈妈|母亲|老人|失联|回复|电话/.test(query) && memory.member === "林秀兰") overlap += 4;
      return { memory, score: overlap + memory.importance * 0.35 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ memory }) => memory);
}

export async function saveToolRun(tool: string, status: string, input: Record<string, unknown>, output: Record<string, unknown>) {
  await ensureProductSchema();
  return db().prepare(`INSERT INTO tool_runs (tool, status, input_json, output_json)
    VALUES (?, ?, ?, ?) RETURNING id, tool, status, input_json AS inputJson,
    output_json AS outputJson, created_at AS createdAt`)
    .bind(tool, status, JSON.stringify(input), JSON.stringify(output))
    .first<{ id: number; tool: string; status: string; inputJson: string; outputJson: string; createdAt: string }>();
}

export async function listToolRuns(limit = 20) {
  await ensureProductSchema();
  const result = await db().prepare(`SELECT id, tool, status, input_json AS inputJson,
    output_json AS outputJson, created_at AS createdAt FROM tool_runs
    ORDER BY id DESC LIMIT ?`).bind(limit).all();
  return result.results ?? [];
}
