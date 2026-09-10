import type { ReportDefinition, ReportFilter, FilterOp } from "@/lib/reports/definition";
import { getRegistry, type EntityRegistry, type FieldDef } from "@/lib/reports/registry";
import { resolveDateRange, type DashboardRange } from "@/lib/date-range";

// Turns a validated ReportDefinition into a safe Prisma query. Every field/op is
// looked up in the registry; anything not allow-listed throws ReportCompileError
// (→ 400). No user string is ever used as a Prisma key without registry lookup.

export class ReportCompileError extends Error {}

type Leaf = unknown;

/** Build a nested object for a dot path, e.g. ("assigned_to.name", leaf) → { assigned_to: { name: leaf } }. */
function nestPath(path: string, leaf: Leaf): Record<string, unknown> {
  const parts = path.split(".");
  const out: Record<string, unknown> = {};
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Record<string, unknown> = {};
    cur[parts[i]] = next;
    cur = next;
  }
  cur[parts[parts.length - 1]] = leaf;
  return out;
}

/** Deep-merge plain objects (used to combine filter/where fragments). */
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function coerceScalar(field: FieldDef, raw: unknown): unknown {
  if (field.type === "number") {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new ReportCompileError(`Field "${field.key}" expects a number`);
    return n;
  }
  if (field.type === "date") {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) throw new ReportCompileError(`Field "${field.key}" expects a date`);
    return d;
  }
  if (field.type === "boolean") return raw === true || raw === "true";
  if (field.type === "enum") {
    const s = String(raw);
    if (field.enumValues && !field.enumValues.includes(s)) {
      throw new ReportCompileError(`Invalid value "${s}" for ${field.key}`);
    }
    return s;
  }
  return String(raw);
}

function toArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return raw == null ? [] : [raw];
}

/** Build the Prisma operator clause for one filter, validated against the field. */
function buildLeaf(field: FieldDef, op: FilterOp, value: unknown): Leaf {
  if (!field.ops.includes(op)) throw new ReportCompileError(`Operator "${op}" not allowed on "${field.key}"`);
  switch (op) {
    case "eq": return coerceScalar(field, value);
    case "neq": return { not: coerceScalar(field, value) };
    case "in": return { in: toArray(value).map((v) => coerceScalar(field, v)) };
    case "contains": return { contains: String(value), mode: "insensitive" };
    case "gt": return { gt: coerceScalar(field, value) };
    case "gte": return { gte: coerceScalar(field, value) };
    case "lt": return { lt: coerceScalar(field, value) };
    case "lte": return { lte: coerceScalar(field, value) };
    case "between": {
      const arr = toArray(value);
      if (arr.length !== 2) throw new ReportCompileError(`"between" on "${field.key}" needs [min, max]`);
      return { gte: coerceScalar(field, arr[0]), lte: coerceScalar(field, arr[1]) };
    }
    case "isNull": return null;
    case "isNotNull": return { not: null };
    default: throw new ReportCompileError(`Unsupported operator "${op}"`);
  }
}

function lookupField(reg: EntityRegistry, key: string): FieldDef {
  const field = reg.fields[key];
  if (!field) throw new ReportCompileError(`Unknown field "${key}" for ${reg.entity}`);
  return field;
}

function buildWhere(def: ReportDefinition, reg: EntityRegistry): Record<string, unknown> {
  let where: Record<string, unknown> = { ...reg.baseWhere };

  for (const filter of def.filters as ReportFilter[]) {
    const field = lookupField(reg, filter.field);
    if (!field.filterable) throw new ReportCompileError(`Field "${field.key}" is not filterable`);
    const leaf = buildLeaf(field, filter.op, filter.value);
    where = deepMerge(where, nestPath(field.prismaPath, leaf));
  }

  if (def.dateRange) {
    const field = lookupField(reg, def.dateRange.field);
    if (field.type !== "date") throw new ReportCompileError(`Date range field "${field.key}" is not a date`);
    const today = new Date().toISOString().slice(0, 10);
    const { start, end } = resolveDateRange(def.dateRange.range as DashboardRange, today, def.dateRange.from, def.dateRange.to);
    where = deepMerge(where, nestPath(field.prismaPath, { gte: new Date(start + "T00:00:00"), lte: new Date(end + "T23:59:59") }));
  }

  return where;
}

function buildSelect(columns: string[], reg: EntityRegistry): Record<string, unknown> {
  const select: Record<string, unknown> = { id: true };
  for (const key of columns) {
    const field = lookupField(reg, key);
    const parts = field.prismaPath.split(".");
    if (parts.length === 1) {
      select[parts[0]] = true;
    } else {
      // to-one relation: { rel: { select: { leaf: true } } }
      const rel = parts[0];
      const existing = (select[rel] as { select?: Record<string, unknown> } | undefined)?.select ?? {};
      select[rel] = { select: { ...existing, [parts.slice(1).join(".")]: true } };
    }
  }
  return select;
}

function buildOrderBy(def: ReportDefinition, reg: EntityRegistry): Record<string, unknown>[] {
  return def.sort.map((s) => {
    const field = lookupField(reg, s.field);
    return nestPath(field.prismaPath, s.dir);
  });
}

export type AggMaps = {
  _sum?: Record<string, true>;
  _avg?: Record<string, true>;
  _min?: Record<string, true>;
  _max?: Record<string, true>;
};

export type CompiledQuery =
  | { kind: "list"; model: EntityRegistry["model"]; where: Record<string, unknown>; select: Record<string, unknown>; orderBy: Record<string, unknown>[]; take: number }
  | ({ kind: "aggregate"; model: EntityRegistry["model"]; where: Record<string, unknown>; by: string[]; dims: string[]; _count: true } & AggMaps);

export function compileReport(def: ReportDefinition): CompiledQuery {
  const reg = getRegistry(def.entity);
  const where = buildWhere(def, reg);

  if (def.mode === "aggregate") {
    // 1- or 2-dimension aggregate. Prisma groupBy supports multiple scalar `by`
    // columns natively; the 2-dim result is pivoted for display in the UI.
    const by = def.groupBy.map((k) => {
      const field = lookupField(reg, k);
      if (!field.groupable) throw new ReportCompileError(`Field "${field.key}" is not groupable`);
      if (field.prismaPath.includes(".")) throw new ReportCompileError(`Cannot group by relation field "${field.key}" yet`);
      return field.prismaPath;
    });
    if (by.length === 0) throw new ReportCompileError("Aggregate report needs at least one group-by dimension");
    if (by.length > 2) throw new ReportCompileError("At most two group-by dimensions are supported");

    const maps: AggMaps = {};
    for (const agg of def.aggregations) {
      if (agg.fn === "count") continue;
      if (!agg.field) throw new ReportCompileError(`Aggregation "${agg.fn}" needs a field`);
      const field = lookupField(reg, agg.field);
      if (!field.aggregatable) throw new ReportCompileError(`Field "${field.key}" is not aggregatable`);
      const key = `_${agg.fn}` as keyof AggMaps; // _sum | _avg | _min | _max
      (maps[key] ??= {})[field.prismaPath] = true;
    }

    return { kind: "aggregate", model: reg.model, where, by, dims: def.groupBy, _count: true, ...maps };
  }

  // list mode
  const columns = def.columns.length ? def.columns : Object.keys(reg.fields).slice(0, 8);
  return {
    kind: "list",
    model: reg.model,
    where,
    select: buildSelect(columns, reg),
    orderBy: buildOrderBy(def, reg),
    take: def.limit,
  };
}
