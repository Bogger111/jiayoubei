import { csvCell } from "./export-records.ts";
import { ProductInputError } from "./product-input.ts";
export function auditExportFilter(input: Record<string, unknown>) {
  if (
    Object.keys(input).some((key) => !["actor", "risk", "date"].includes(key))
  )
    throw new ProductInputError("导出筛选包含不支持的字段");
  const choose = (value: unknown, allowed: string[]) => {
    const selected = value ?? "all";
    if (typeof selected !== "string" || !allowed.includes(selected))
      throw new ProductInputError("导出筛选不正确");
    return selected;
  };
  return {
    actor: choose(input.actor, ["all", "user", "ai", "device", "rule"]),
    risk: choose(input.risk, [
      "all",
      "normal",
      "attention",
      "warning",
      "critical",
    ]),
    date: choose(input.date, ["all", "today", "yesterday"]),
  };
}
type ExportRecord = {
  time: string;
  actor: string;
  actorType: string;
  target: string;
  action: string;
  reason: string;
  riskLevel: string;
  result: string;
};
export function buildAuditCsv(logs: ExportRecord[]) {
  const actors: Record<string, string> = {
    user: "家庭成员",
    ai: "AI",
    device: "设备",
    rule: "安全规则",
  };
  const risks: Record<string, string> = {
    normal: "正常",
    attention: "关注",
    warning: "警告",
    critical: "紧急",
  };
  const head = [
    "时间",
    "操作者",
    "类型",
    "对象",
    "动作",
    "原因",
    "风险",
    "结果",
  ];
  return [
    head,
    ...logs.map((log) => [
      log.time,
      log.actor,
      actors[log.actorType] ?? log.actorType,
      log.target,
      log.action,
      log.reason,
      risks[log.riskLevel] ?? log.riskLevel,
      log.result === "success"
        ? "成功"
        : log.result === "blocked"
          ? "已拦截"
          : "失败",
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
