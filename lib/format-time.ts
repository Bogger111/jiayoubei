export function formatTime(value: string, timezone = "Asia/Shanghai"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDateTime(
  value: string,
  timezone = "Asia/Shanghai",
): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function matchesDay(
  value: string,
  filter: string,
  timezone = "Asia/Shanghai",
  current = Date.now(),
) {
  if (filter === "all") return true;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    return filter === "yesterday"
      ? value.includes("昨天")
      : !value.includes("昨天");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (
    formatter.format(date) ===
    formatter.format(
      new Date(current - (filter === "yesterday" ? 86_400_000 : 0)),
    )
  );
}
