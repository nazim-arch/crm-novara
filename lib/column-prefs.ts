import { prisma } from "@/lib/prisma";

export type ColumnDef = {
  id: string;
  label: string;
  /** Always shown; cannot be toggled off in the picker. */
  locked?: boolean;
  /** Available in the picker but hidden until the user opts in. */
  defaultHidden?: boolean;
};

export function prefKey(listKey: string): string {
  return `columns:${listKey}`;
}

/** Column ids shown when the user has no saved preference. */
export function defaultVisibleColumns(columns: ColumnDef[]): string[] {
  return columns.filter((c) => !c.defaultHidden).map((c) => c.id);
}

/**
 * Resolve the visible column ids for a list, falling back to defaults when the
 * user has no saved preference (or the preferences table is unavailable).
 * Locked columns are always included.
 */
export async function getVisibleColumns(
  userId: string,
  listKey: string,
  columns: ColumnDef[]
): Promise<Set<string>> {
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { user_id_key: { user_id: userId, key: prefKey(listKey) } },
      select: { value: true },
    });
    const val = pref?.value;
    if (Array.isArray(val)) {
      const known = new Set(columns.map((c) => c.id));
      const visible = new Set(
        val.filter((v): v is string => typeof v === "string" && known.has(v))
      );
      for (const c of columns) if (c.locked) visible.add(c.id);
      return visible;
    }
  } catch {
    // Table may not exist yet (pending migration) — fall back to defaults
  }
  return new Set(defaultVisibleColumns(columns));
}
