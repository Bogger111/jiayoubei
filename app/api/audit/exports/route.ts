import { privateJson } from "@/lib/server/json-response";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  apiError,
  isFamilyAdmin,
  requireSession,
  unauthorized,
} from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
import { ProductInputError } from "@/lib/product-input";
import { auditExportFilter, buildAuditCsv } from "@/lib/audit-export";
import { matchesDay } from "@/lib/format-time";
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (!session?.user) return unauthorized();
    if (!isFamilyAdmin(session.user))
      throw new ProductInputError("批量导出需要家庭管理员权限", 403);
    const filter = auditExportFilter(await readObjectBody(request));
    const db = getDb();
    const [families, records] = await Promise.all([
      db
        .select({ timezone: schema.families.timezone })
        .from(schema.families)
        .where(eq(schema.families.id, session.user.familyId))
        .limit(1),
      db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.familyId, session.user.familyId))
        .orderBy(desc(schema.auditLogs.time)),
    ]);
    if (!families[0]) throw new ProductInputError("家庭不存在", 404);
    const generatedAt = new Date().toISOString();
    const logs = records.filter(
      (log) =>
        (filter.actor === "all" || filter.actor === log.actorType) &&
        (filter.risk === "all" || filter.risk === log.riskLevel) &&
        matchesDay(
          log.time,
          filter.date,
          families[0].timezone,
          Date.parse(generatedAt),
        ),
    );
    const content = buildAuditCsv(logs);
    await db.insert(schema.auditLogs).values({
      id: `AL_${crypto.randomUUID()}`,
      familyId: session.user.familyId,
      actor: session.user.name,
      actorType: "user",
      time: generatedAt,
      target: "审计导出",
      action: "生成审计导出文件",
      reason: `生成 ${logs.length} 条符合所选操作者、风险和日期范围的记录（CSV）`,
      riskLevel: "normal",
      result: "success",
    });
    return privateJson(
      { content, count: logs.length, generatedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return apiError(cause);
  }
}
