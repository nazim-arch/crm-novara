import { prisma } from "@/lib/prisma";
import type { CompiledQuery } from "@/lib/reports/compile";

// Executes a compiled report against the correct Prisma delegate. The model name
// comes from the registry (a fixed union), so the dynamic delegate access is safe.

type Delegate = {
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args: unknown) => Promise<number>;
  groupBy: (args: unknown) => Promise<unknown[]>;
};

function delegateFor(model: string): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[model];
}

/** Recursively convert Prisma Decimal/Date to JSON-friendly primitives. */
function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Prisma Decimal has a toNumber / toString; detect via constructor name.
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
    if (ctor === "Decimal") return Number(value as unknown as number);
    if (Array.isArray(value)) return value.map(toPlain);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export interface RunListResult {
  kind: "list";
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}
export interface RunAggregateResult {
  kind: "aggregate";
  groups: Record<string, unknown>[];
}

export async function executeCompiled(
  compiled: CompiledQuery,
  opts: { page?: number; pageSize?: number } = {},
): Promise<RunListResult | RunAggregateResult> {
  const delegate = delegateFor(compiled.model);

  if (compiled.kind === "aggregate") {
    const groups = await delegate.groupBy({
      by: compiled.by,
      where: compiled.where,
      _count: compiled._count,
      ...(compiled._sum ? { _sum: compiled._sum } : {}),
      ...(compiled._avg ? { _avg: compiled._avg } : {}),
      ...(compiled._min ? { _min: compiled._min } : {}),
      ...(compiled._max ? { _max: compiled._max } : {}),
    });
    return { kind: "aggregate", groups: (groups as unknown[]).map((g) => toPlain(g) as Record<string, unknown>) };
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(compiled.take, Math.max(1, opts.pageSize ?? 50));
  const [total, rows] = await Promise.all([
    delegate.count({ where: compiled.where }),
    delegate.findMany({
      where: compiled.where,
      select: compiled.select,
      orderBy: compiled.orderBy.length ? compiled.orderBy : undefined,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { kind: "list", rows: (rows as unknown[]).map((r) => toPlain(r) as Record<string, unknown>), total, page, pageSize };
}
