// Shared helpers for task checklists (stored as JSON on Task.checklist).
// No server-only imports — safe to use in client components.

export type ChecklistItem = { text: string; done: boolean };

/** Coerce an unknown JSON value into a well-formed checklist array. */
export function parseChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object" && !Array.isArray(i))
    .map((i) => ({ text: String(i.text ?? ""), done: Boolean(i.done) }));
}

/** Returns { done, total } or null when there is no checklist. */
export function checklistProgress(value: unknown): { done: number; total: number } | null {
  const items = parseChecklist(value);
  if (items.length === 0) return null;
  return { done: items.filter((i) => i.done).length, total: items.length };
}
