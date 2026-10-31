import { env } from "cloudflare:workers";
import type { FamilyMemory } from "./contracts";
import { ProductInputError } from "./product-input";

function db(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  return binding;
}

async function initializeSchema() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS family_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id TEXT NOT NULL DEFAULT 'F001',
      member TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS tool_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id TEXT NOT NULL DEFAULT 'F001',
      tool TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS memories_member_idx ON family_memories(member)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS tool_runs_created_idx ON tool_runs(created_at)",
    ),
  ]);

  // Preserve existing single-family records while adding family ownership.
  for (const table of ["family_memories", "tool_runs"]) {
    const columns = await database
      .prepare(`PRAGMA table_info(${table})`)
      .all<{ name: string }>();
    if (!columns.results.some((column) => column.name === "family_id"))
      await database
        .prepare(
          `ALTER TABLE ${table} ADD COLUMN family_id TEXT NOT NULL DEFAULT 'F001'`,
        )
        .run();
    await database
      .prepare(
        `CREATE INDEX IF NOT EXISTS ${table}_family_idx ON ${table}(family_id)`,
      )
      .run();
  }

}
let schemaReady: Promise<void> | null = null;
export async function ensureProductSchema() {
  schemaReady ??= initializeSchema().catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

export async function listMemories(familyId: string): Promise<FamilyMemory[]> {
  await ensureProductSchema();
  const result = await db()
    .prepare(
      `SELECT id, member, type, content, source, importance,
    created_at AS createdAt FROM family_memories WHERE family_id = ? ORDER BY importance DESC, id ASC`,
    )
    .bind(familyId)
    .all<FamilyMemory>();
  return result.results ?? [];
}

export async function addMemory(
  familyId: string,
  input: Omit<FamilyMemory, "id" | "createdAt">,
): Promise<FamilyMemory> {
  await ensureProductSchema();
  const result = await db()
    .prepare(
      `INSERT INTO family_memories
    (family_id, member, type, content, source, importance) VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id, member, type, content, source, importance, created_at AS createdAt`,
    )
    .bind(
      familyId,
      input.member,
      input.type,
      input.content,
      input.source,
      input.importance,
    )
    .first<FamilyMemory>();
  if (!result) throw new Error("memory insert failed");
  return result;
}

export async function updateMemory(familyId: string, id: number, content: string, originalContent: string): Promise<FamilyMemory> {
  await ensureProductSchema();
  const current = await db().prepare('SELECT id FROM family_memories WHERE id=? AND family_id=?').bind(id, familyId).first();
  if (!current) throw new ProductInputError('记忆不存在', 404);
  const saved = await db().prepare(`UPDATE family_memories SET content=? WHERE id=? AND family_id=? AND content=?
    RETURNING id, member, type, content, source, importance, created_at AS createdAt`)
    .bind(content, id, familyId, originalContent).first<FamilyMemory>();
  if (!saved) throw new ProductInputError('这条记忆已有更新，请关闭后刷新页面再编辑', 409);
  // Retrieval hashes the current text, so a later search re-embeds changed content.
  return saved;
}

function terms(text: string) {
  const normalized = text.toLowerCase().replace(/[，。！？、：；,.!?\s]/g, "");
  const values = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1)
    values.add(normalized.slice(i, i + 2));
  [
    "母亲",
    "妈妈",
    "老人",
    "回复",
    "电话",
    "午休",
    "静音",
    "独居",
    "用药",
    "邻居",
    "授权",
    "失联",
    "门磁",
    "活动",
  ].forEach((term) => {
    if (text.includes(term)) values.add(term);
  });
  return values;
}

export async function retrieveMemories(
  familyId: string,
  query: string,
  limit = 4,
): Promise<FamilyMemory[]> {
  const memories = await listMemories(familyId);
  const queryTerms = terms(query);
  return memories
    .map((memory) => {
      const memoryTerms = terms(
        `${memory.member}${memory.type}${memory.content}`,
      );
      let overlap = 0;
      queryTerms.forEach((term) => {
        if (memoryTerms.has(term)) overlap += term.length > 2 ? 3 : 1;
      });
      if (query.includes(memory.member))
        overlap += 4;
      return { memory, score: overlap + memory.importance * 0.35 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ memory }) => memory);
}

export async function saveToolRun(
  familyId: string,
  tool: string,
  status: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  await ensureProductSchema();
  return db()
    .prepare(
      `INSERT INTO tool_runs (family_id, tool, status, input_json, output_json)
    VALUES (?, ?, ?, ?, ?) RETURNING id, tool, status, input_json AS inputJson,
    output_json AS outputJson, created_at AS createdAt`,
    )
    .bind(familyId, tool, status, JSON.stringify(input), JSON.stringify(output))
    .first<{
      id: number;
      tool: string;
      status: string;
      inputJson: string;
      outputJson: string;
      createdAt: string;
    }>();
}

export async function listToolRuns(familyId: string, limit = 20) {
  await ensureProductSchema();
  const result = await db()
    .prepare(
      `SELECT id, tool, status, input_json AS inputJson,
    output_json AS outputJson, created_at AS createdAt FROM tool_runs WHERE family_id = ?
    ORDER BY id DESC LIMIT ?`,
    )
    .bind(familyId, limit)
    .all();
  return result.results ?? [];
}
