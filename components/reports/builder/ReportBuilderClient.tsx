"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Play, Save, Trash2, Download, Loader2 } from "lucide-react";
import { REPORT_ENTITIES, type ReportEntity, type FilterOp, type Aggregation } from "@/lib/reports/definition";
import { entityFieldList } from "@/lib/reports/registry";

// Non-custom presets accepted by resolveDateRange (lib/date-range.ts).
const RANGE_OPTIONS = [
  { value: "current_month", label: "This Month" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "Year to Date" },
] as const;

type FieldMeta = ReturnType<typeof entityFieldList>[number];
type FilterRow = { field: string; op: FilterOp; value: string };
type SavedRef = { id: string; name: string; entity: string };

const NO_VALUE_OPS: FilterOp[] = ["isNull", "isNotNull"];
const METRIC_FNS: Aggregation[] = ["sum", "avg", "min", "max"];

const ReportBarChart = dynamic(
  () => import("@/components/reports/builder/ReportBarChart").then((m) => m.ReportBarChart),
  { ssr: false, loading: () => <div className="h-[280px] animate-pulse rounded-lg bg-muted" /> },
);

export function ReportBuilderClient() {
  const [entity, setEntity] = useState<ReportEntity>("lead");
  const [mode, setMode] = useState<"list" | "aggregate">("list");
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string>("");
  const [groupBy2, setGroupBy2] = useState<string>("");
  const [metricField, setMetricField] = useState<string>("");
  const [metricFns, setMetricFns] = useState<Aggregation[]>([]);
  const [sortField, setSortField] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drField, setDrField] = useState<string>("");
  const [drRange, setDrRange] = useState<string>("current_month");

  const [name, setName] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRef[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ kind: "list"; rows: Record<string, unknown>[]; total: number } | { kind: "aggregate"; groups: Record<string, unknown>[] } | null>(null);

  const fields: FieldMeta[] = useMemo(() => entityFieldList(entity), [entity]);
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const dateFields = fields.filter((f) => f.type === "date");
  const groupableFields = fields.filter((f) => f.groupable && !f.type.includes("relation"));
  const numericFields = fields.filter((f) => f.aggregatable);

  useEffect(() => { void loadSavedList(); }, []);
  // Reset entity-specific selections when the entity changes.
  useEffect(() => { setFilters([]); setColumns([]); setGroupBy(""); setGroupBy2(""); setMetricField(""); setMetricFns([]); setSortField(""); setDrField(""); setResult(null); }, [entity]);

  async function loadSavedList() {
    const res = await fetch("/api/reports/custom");
    if (res.ok) setSaved((await res.json()).data ?? []);
  }

  function buildDefinition() {
    return {
      entity,
      mode,
      filters: filters
        .filter((f) => f.field && (NO_VALUE_OPS.includes(f.op) || f.value !== ""))
        .map((f) => ({ field: f.field, op: f.op, value: NO_VALUE_OPS.includes(f.op) ? undefined : f.value })),
      columns: mode === "list" ? columns : [],
      groupBy: mode === "aggregate" ? [groupBy, groupBy2].filter(Boolean) : [],
      aggregations: mode === "aggregate"
        ? [{ field: null, fn: "count" as Aggregation }, ...(metricField ? metricFns.map((fn) => ({ field: metricField, fn })) : [])]
        : [],
      sort: mode === "list" && sortField ? [{ field: sortField, dir: sortDir }] : [],
      dateRange: drField ? { field: drField, range: drRange } : undefined,
      limit: 1000,
    };
  }

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/reports/custom/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: buildDefinition(), page: 1, pageSize: 50 }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Failed to run report"); return; }
      setResult(json.data);
    } catch { toast.error("Something went wrong"); }
    finally { setRunning(false); }
  }

  async function save() {
    if (!name.trim()) { toast.error("Name your report first"); return; }
    const body = { name: name.trim(), entity, definition: buildDefinition() };
    const res = currentId
      ? await fetch(`/api/reports/custom/${currentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: body.name, definition: body.definition }) })
      : await fetch("/api/reports/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Save failed"); return; }
    toast.success("Report saved");
    if (!currentId) setCurrentId(json.data.id);
    void loadSavedList();
  }

  async function load(id: string) {
    const res = await fetch(`/api/reports/custom/${id}`);
    if (!res.ok) { toast.error("Could not load report"); return; }
    const { data } = await res.json();
    const d = data.definition;
    setCurrentId(data.id);
    setName(data.name);
    setEntity(data.entity);
    // Defer definition hydration until after entity-change reset flushes.
    setTimeout(() => {
      setMode(d.mode ?? "list");
      setFilters((d.filters ?? []).map((f: { field: string; op: FilterOp; value?: unknown }) => ({ field: f.field, op: f.op, value: f.value == null ? "" : String(f.value) })));
      setColumns(d.columns ?? []);
      setGroupBy(d.groupBy?.[0] ?? "");
      setGroupBy2(d.groupBy?.[1] ?? "");
      const metricAggs = (d.aggregations ?? []).filter((a: { fn: string; field: string | null }) => a.fn !== "count" && a.field);
      setMetricField(metricAggs[0]?.field ?? "");
      setMetricFns(metricAggs.map((a: { fn: Aggregation }) => a.fn));
      setSortField(d.sort?.[0]?.field ?? "");
      setSortDir(d.sort?.[0]?.dir ?? "desc");
      setDrField(d.dateRange?.field ?? "");
      setDrRange(d.dateRange?.range ?? "current_month");
    }, 0);
  }

  async function remove() {
    if (!currentId) return;
    const res = await fetch(`/api/reports/custom/${currentId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Delete failed"); return; }
    toast.success("Report deleted");
    setCurrentId(null); setName("");
    void loadSavedList();
  }

  function newReport() { setCurrentId(null); setName(""); setResult(null); setFilters([]); setColumns([]); }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <Field label="Entity">
            <Select value={entity} onValueChange={(v) => v && setEntity(v as ReportEntity)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_ENTITIES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mode">
            <Select value={mode} onValueChange={(v) => v && setMode(v as "list" | "aggregate")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="list">List</SelectItem>
                <SelectItem value="aggregate">Aggregate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Report name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot leads this month" className="w-56" />
          </Field>
          <div className="flex items-center gap-2 ml-auto">
            <Select value={currentId ?? ""} onValueChange={(v) => v && load(v)}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Load saved report…" /></SelectTrigger>
              <SelectContent>
                {saved.length === 0 ? <SelectItem value="__none" disabled>No saved reports</SelectItem>
                  : saved.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.entity})</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={newReport}>New</Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setFilters([...filters, { field: fields[0]?.key ?? "", op: "eq", value: "" }])}>
            <Plus className="h-4 w-4 mr-1" /> Add filter
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {filters.length === 0 && <p className="text-xs text-muted-foreground">No filters — all rows.</p>}
          {filters.map((row, i) => {
            const meta = fieldByKey.get(row.field);
            const ops = meta?.ops ?? [];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select value={row.field} onValueChange={(v) => v && updateFilter(i, { field: v, op: (fieldByKey.get(v)?.ops[0] ?? "eq") as FilterOp })}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{fields.filter((f) => f.filterable).map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={row.op} onValueChange={(v) => v && updateFilter(i, { op: v as FilterOp })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{ops.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
                {!NO_VALUE_OPS.includes(row.op) && (
                  meta?.type === "enum" && meta.enumValues && row.op !== "in" ? (
                    <Select value={row.value} onValueChange={(v) => v && updateFilter(i, { value: v })}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="value" /></SelectTrigger>
                      <SelectContent>{meta.enumValues.map((ev) => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input value={row.value} onChange={(e) => updateFilter(i, { value: e.target.value })}
                      placeholder={row.op === "in" || row.op === "between" ? "comma,separated" : "value"} className="w-44" />
                  )
                )}
                <Button variant="ghost" size="icon" onClick={() => setFilters(filters.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Mode-specific config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mode === "list" ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Columns</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-x-4 gap-y-1.5">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={columns.includes(f.key)}
                    onChange={(e) => setColumns(e.target.checked ? [...columns, f.key] : columns.filter((c) => c !== f.key))} />
                  {f.label}
                </label>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Group & aggregate</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <Field label="Group by">
                <Select value={groupBy} onValueChange={(v) => v && setGroupBy(v)}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="dimension" /></SelectTrigger>
                  <SelectContent>{groupableFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Then by (optional)">
                <Select value={groupBy2} onValueChange={(v) => setGroupBy2(v === "__none" ? "" : (v ?? ""))}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="none" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {groupableFields.filter((f) => f.key !== groupBy).map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Metric field (optional)">
                <Select value={metricField} onValueChange={(v) => { const nv = v === "__none" ? "" : (v ?? ""); setMetricField(nv); if (!nv) setMetricFns([]); }}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="count only" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Count only</SelectItem>
                    {numericFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {metricField && (
                <div className="flex items-center gap-3 pb-1.5">
                  {METRIC_FNS.map((fn) => (
                    <label key={fn} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={metricFns.includes(fn)}
                        onChange={(e) => setMetricFns(e.target.checked ? [...metricFns, fn] : metricFns.filter((x) => x !== fn))} />
                      {fn}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground w-full">Count is always included. Add a second dimension for a pivot; pick a numeric metric + functions for sums/averages.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Sort & date range</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            {mode === "list" && (
              <>
                <Field label="Sort by">
                  <Select value={sortField} onValueChange={(v) => setSortField(v === "__none" ? "" : (v ?? ""))}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="none" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Dir">
                  <Select value={sortDir} onValueChange={(v) => v && setSortDir(v as "asc" | "desc")}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="asc">Asc</SelectItem><SelectItem value="desc">Desc</SelectItem></SelectContent>
                  </Select>
                </Field>
              </>
            )}
            <Field label="Date field">
              <Select value={drField} onValueChange={(v) => setDrField(v === "__none" ? "" : (v ?? ""))}>
                <SelectTrigger className="w-40"><SelectValue placeholder="none" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {dateFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {drField && (
              <Field label="Range">
                <Select value={drRange} onValueChange={(v) => v && setDrRange(v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{RANGE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button onClick={run} disabled={running}>{running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}Run</Button>
        <Button variant="outline" onClick={save}><Save className="h-4 w-4 mr-1" />{currentId ? "Update" : "Save"}</Button>
        {currentId && <Button variant="outline" onClick={remove}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>}
        {currentId && (
          <Button variant="outline" render={<a href={`/api/reports/custom/${currentId}/export`} />}>
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        )}
      </div>

      {/* Preview */}
      {result && <PreviewTable result={result} fieldByKey={fieldByKey} groupBy={groupBy} groupBy2={groupBy2} metricField={metricField} metricFns={metricFns} />}
    </div>
  );

  function updateFilter(i: number, patch: Partial<FilterRow>) {
    setFilters(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function groupCount(g: Record<string, unknown>): number {
  const c = g._count as unknown;
  return typeof c === "number" ? c : ((c as { _all?: number })?._all ?? 0);
}

function PreviewTable({
  result, fieldByKey, groupBy, groupBy2, metricField, metricFns,
}: {
  result: { kind: "list"; rows: Record<string, unknown>[]; total: number } | { kind: "aggregate"; groups: Record<string, unknown>[] };
  fieldByKey: Map<string, FieldMeta>;
  groupBy: string;
  groupBy2: string;
  metricField: string;
  metricFns: Aggregation[];
}) {
  if (result.kind === "aggregate") {
    const dim1 = fieldByKey.get(groupBy);
    const metricLabel = fieldByKey.get(metricField)?.label ?? metricField;

    // 2-dimension pivot: dim1 rows × dim2 columns, cells = count.
    if (groupBy2) {
      const colVals = Array.from(new Set(result.groups.map((g) => String(g[groupBy2] ?? "—")))).sort();
      const rowMap = new Map<string, Record<string, number>>();
      for (const g of result.groups) {
        const r = String(g[groupBy] ?? "—");
        const c = String(g[groupBy2] ?? "—");
        const m = rowMap.get(r) ?? {};
        m[c] = (m[c] ?? 0) + groupCount(g);
        rowMap.set(r, m);
      }
      return (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pivot — {rowMap.size} × {colVals.length} (counts)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-3 py-2 text-left">{dim1?.label ?? groupBy}</th>
                {colVals.map((c) => <th key={c} className="px-3 py-2 text-right">{c}</th>)}
              </tr></thead>
              <tbody>
                {[...rowMap.entries()].map(([r, cells]) => (
                  <tr key={r} className="border-t">
                    <td className="px-3 py-2 font-medium">{r}</td>
                    {colVals.map((c) => <td key={c} className="px-3 py-2 text-right">{cells[c] ?? 0}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      );
    }

    // 1-dimension: count + chosen metric functions, plus a bar chart of counts.
    const chartData = result.groups.map((g) => ({ name: String(g[groupBy] ?? "—"), value: groupCount(g) }));
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Result — {result.groups.length} groups</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ReportBarChart data={chartData} valueLabel="Count" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-3 py-2 text-left">{dim1?.label ?? groupBy}</th>
                <th className="px-3 py-2 text-right">Count</th>
                {metricField && metricFns.map((fn) => <th key={fn} className="px-3 py-2 text-right whitespace-nowrap">{fn} {metricLabel}</th>)}
              </tr></thead>
              <tbody>
                {result.groups.map((g, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{String(g[groupBy] ?? "—")}</td>
                    <td className="px-3 py-2 text-right">{groupCount(g)}</td>
                    {metricField && metricFns.map((fn) => {
                      const v = (g[`_${fn}`] as Record<string, unknown> | undefined)?.[metricField];
                      return <td key={fn} className="px-3 py-2 text-right">{v == null ? "—" : String(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cols = result.rows.length ? Object.keys(result.rows[0]).filter((k) => k !== "id") : [];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Result — {result.total} rows (showing {result.rows.length})</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50"><tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={i} className="border-t">
                {cols.map((c) => {
                  const v = r[c];
                  return <td key={c} className="px-3 py-2 whitespace-nowrap">{v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
