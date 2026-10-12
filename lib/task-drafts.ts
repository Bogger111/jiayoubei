export type TaskDraft = { notes: string; version: number; updatedAt: number };
const prefix = "jyb-task-draft:";
const scope = (userId: string, familyId: string) =>
  `${prefix}${encodeURIComponent(userId)}:${encodeURIComponent(familyId)}:`;
export const taskDraftKey = (
  userId: string,
  familyId: string,
  taskId: string,
) => `${scope(userId, familyId)}${encodeURIComponent(taskId)}`;

export function readTaskDraft(key: string): TaskDraft | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("notes" in value) ||
      typeof value.notes !== "string" ||
      value.notes.length > 4000 ||
      !("version" in value) ||
      !Number.isInteger(value.version) ||
      Number(value.version) < 0 ||
      !("updatedAt" in value) ||
      typeof value.updatedAt !== "number" ||
      value.updatedAt > Date.now() ||
      Date.now() - value.updatedAt > 86_400_000
    ) {
      sessionStorage.removeItem(key);
      return undefined;
    }
    return value as TaskDraft;
  } catch {
    return undefined;
  }
}
export function storeTaskDraft(
  key: string,
  draft: TaskDraft | undefined,
): boolean {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
export function clearTaskDrafts(userId: string, familyId: string) {
  if (typeof window === "undefined") return;
  try {
    const ownPrefix = scope(userId, familyId);
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(ownPrefix)) sessionStorage.removeItem(key);
  } catch {
    /* A restricted browser has no persisted draft to clear. */
  }
}
