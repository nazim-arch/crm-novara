/**
 * Helpers for multi-value list filters carried in the URL as comma-separated params.
 * e.g. `?status=New,Contacted` → `["New", "Contacted"]` → Prisma `{ in: [...] }`.
 */

export function parseMulti(param?: string | string[] | null): string[] {
  if (!param) return [];
  const raw = Array.isArray(param) ? param.join(",") : param;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a Prisma `{ in: [...] }` clause from a multi-value param, or `undefined`
 * when nothing is selected (so it can be spread into a `where` conditionally).
 */
export function multiIn<T extends string = string>(
  param?: string | string[] | null
): { in: T[] } | undefined {
  const values = parseMulti(param);
  return values.length ? { in: values as T[] } : undefined;
}
