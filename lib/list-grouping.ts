/**
 * Group an array of rows by a key accessor into ordered sections for rendering
 * section headers (label + count) in list tables.
 */

export type RowGroup<T> = {
  key: string;
  label: string;
  count: number;
  rows: T[];
};

const EMPTY_KEY = "__none__";

export function groupRows<T>(
  rows: T[],
  keyAccessor: (row: T) => string | null | undefined,
  labelAccessor?: (key: string, firstRow: T) => string
): RowGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const raw = keyAccessor(row);
    const key = raw == null || raw === "" ? EMPTY_KEY : raw;
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return Array.from(map.entries()).map(([key, groupRows]) => ({
    key,
    label:
      key === EMPTY_KEY
        ? "—"
        : labelAccessor
          ? labelAccessor(key, groupRows[0])
          : key,
    count: groupRows.length,
    rows: groupRows,
  }));
}
