/** Neutralize spreadsheet formulas while preserving ordinary quoted CSV cells. */
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
