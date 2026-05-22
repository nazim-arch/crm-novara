"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, ArrowRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityRow {
  id: string;
  time: string;
  lead_id: string;
  lead_name: string;
  lead_number: string;
  action: string;
  action_label: string;
  pipeline_from: string;
  pipeline_to: string;
  activity_from: string;
  activity_to: string;
  notes: string;
  actor_id: string;
  actor_name: string;
}

interface Summary {
  total_activities: number;
  unique_leads: number;
  unique_agents: number;
  action_breakdown: Record<string, number>;
}

interface Pagination { page: number; page_size: number; total: number; pages: number; }

interface ApiResponse {
  data: ActivityRow[];
  summary: Summary;
  pagination: Pagination;
}

const ACTION_LABELS: Record<string, string> = {
  stage_changed: "Stage Changed",
  activity_stage_changed: "Activity Stage",
  note_added: "Note Added",
  lead_updated: "Lead Updated",
  lead_created: "Lead Created",
  opportunity_tagged: "Opportunity Tagged",
  followup_completed: "Follow-up Completed",
  no_response: "No Response",
  marked_unreachable: "Marked Unreachable",
  callback_scheduled: "Callback Scheduled",
  attempt_call: "Call Attempt",
  attempt_whatsapp: "WhatsApp Attempt",
  attempt_email: "Email Attempt",
};

const ACTION_COLORS: Record<string, string> = {
  stage_changed: "bg-indigo-100 text-indigo-700",
  activity_stage_changed: "bg-violet-100 text-violet-700",
  note_added: "bg-amber-100 text-amber-700",
  lead_created: "bg-emerald-100 text-emerald-700",
  lead_updated: "bg-blue-100 text-blue-700",
  opportunity_tagged: "bg-purple-100 text-purple-700",
  followup_completed: "bg-green-100 text-green-700",
  no_response: "bg-orange-100 text-orange-700",
  marked_unreachable: "bg-red-100 text-red-700",
  callback_scheduled: "bg-cyan-100 text-cyan-700",
  attempt_call: "bg-teal-100 text-teal-700",
  attempt_whatsapp: "bg-teal-100 text-teal-700",
  attempt_email: "bg-teal-100 text-teal-700",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split("T")[0]; }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
function nDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function weekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().split("T")[0];
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function StageArrow({ from, to }: { from: string; to: string }) {
  if (!from && !to) return null;
  const format = (s: string) => s.replace(/([A-Z])/g, " $1").trim();
  return (
    <span className="flex items-center gap-1 text-xs whitespace-nowrap">
      {from && <span className="text-muted-foreground">{format(from)}</span>}
      {from && to && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
      {to && <span className="font-medium text-foreground">{format(to)}</span>}
    </span>
  );
}

// ── Export CSV ────────────────────────────────────────────────────────────────

function exportCSV(rows: ActivityRow[], dateFrom: string, dateTo: string) {
  const headers = ["Time", "Lead", "Lead Number", "Agent", "Action", "Pipeline From", "Pipeline To", "Activity From", "Activity To", "Notes"];
  const lines = rows.map((r) => [
    fmtTime(r.time),
    r.lead_name,
    r.lead_number,
    r.actor_name,
    r.action_label,
    r.pipeline_from,
    r.pipeline_to,
    r.activity_from,
    r.activity_to,
    r.notes.replace(/"/g, '""'),
  ].map((v) => `"${v}"`).join(","));

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-report-${dateFrom}-to-${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DailyActivityClient({ users }: { users: { id: string; name: string }[] }) {
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [actorId, setActorId] = useState("all");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [activePreset, setActivePreset] = useState<string>("today");

  const fetchData = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, page: String(p) });
    if (actorId !== "all") params.set("actor_id", actorId);
    if (action !== "all") params.set("action", action);
    const res = await fetch(`/api/reports/daily-activity?${params}`);
    if (res.ok) setResult(await res.json());
    setLoading(false);
  }, [dateFrom, dateTo, actorId, action, page]);

  useEffect(() => {
    setPage(1);
    void fetchData(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, actorId, action]);

  function applyPreset(preset: string) {
    setActivePreset(preset);
    setPage(1);
    if (preset === "today") { setDateFrom(today()); setDateTo(today()); }
    else if (preset === "yesterday") { setDateFrom(yesterday()); setDateTo(yesterday()); }
    else if (preset === "last7") { setDateFrom(nDaysAgo(6)); setDateTo(today()); }
    else if (preset === "thisweek") { setDateFrom(weekStart()); setDateTo(today()); }
  }

  const summary = result?.summary;
  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  const presets = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "last7", label: "Last 7 Days" },
    { key: "thisweek", label: "This Week" },
  ];

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-end">
        {/* Date presets */}
        <div className="flex gap-1">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                activePreset === p.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom range */}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setActivePreset("custom"); }}
            className="h-8 text-xs w-36"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setActivePreset("custom"); }}
            className="h-8 text-xs w-36"
          />
        </div>

        {/* Agent filter */}
        <Select value={actorId} onValueChange={(v) => v && setActorId(v)}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue>{actorId === "all" ? "All Agents" : users.find((u) => u.id === actorId)?.name ?? "Agent"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Action filter */}
        <Select value={action} onValueChange={(v) => v && setAction(v)}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue>{action === "all" ? "All Actions" : ACTION_LABELS[action] ?? action}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {Object.entries(ACTION_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => fetchData(page)}>
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
          {rows.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => exportCSV(rows, dateFrom, dateTo)}>
              <Download className="h-3.5 w-3.5" />Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary Stats ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="py-0">
            <CardContent className="py-3 px-4">
              <p className="text-2xl font-bold">{summary.total_activities}</p>
              <p className="text-xs text-muted-foreground">Total Activities</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="py-3 px-4">
              <p className="text-2xl font-bold text-blue-600">{summary.unique_leads}</p>
              <p className="text-xs text-muted-foreground">Leads Touched</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="py-3 px-4">
              <p className="text-2xl font-bold text-violet-600">{summary.unique_agents}</p>
              <p className="text-xs text-muted-foreground">Agents Active</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="py-3 px-4">
              <p className="text-2xl font-bold text-emerald-600">
                {(summary.action_breakdown.stage_changed ?? 0) + (summary.action_breakdown.activity_stage_changed ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Stage Changes</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Action Breakdown ── */}
      {summary && Object.keys(summary.action_breakdown).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.action_breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([act, count]) => (
              <button
                key={act}
                onClick={() => setAction(action === act ? "all" : act)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  action === act
                    ? "border-primary bg-primary text-primary-foreground"
                    : `${ACTION_COLORS[act] ?? "bg-muted text-muted-foreground"} border-transparent hover:opacity-80`
                }`}
              >
                <span>{ACTION_LABELS[act] ?? act}</span>
                <span className="font-bold">{count}</span>
              </button>
            ))}
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border bg-card">
          <p className="text-base font-medium">No activity found</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting the date range or filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-36">Time</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Lead</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-28">Agent</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-36">Action</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-44">Stage</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtTime(row.time)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/leads/${row.lead_id}`} className="font-medium hover:underline text-sm">
                          {row.lead_name}
                        </Link>
                        <p className="text-[11px] font-mono text-muted-foreground">{row.lead_number}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium">{row.actor_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${ACTION_COLORS[row.action] ?? "bg-muted text-muted-foreground"}`}>
                          {row.action_label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {(row.pipeline_from || row.pipeline_to) && (
                          <StageArrow from={row.pipeline_from} to={row.pipeline_to} />
                        )}
                        {(row.activity_from || row.activity_to) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Activity: {[row.activity_from, row.activity_to].filter(Boolean).join(" → ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        {row.notes ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{row.notes}</p>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/leads/${row.lead_id}`} className="font-medium text-sm hover:underline">
                      {row.lead_name}
                    </Link>
                    <p className="text-[11px] font-mono text-muted-foreground">{row.lead_number}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${ACTION_COLORS[row.action] ?? "bg-muted text-muted-foreground"}`}>
                    {row.action_label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{row.actor_name}</span>
                  <span>{fmtTime(row.time)}</span>
                </div>
                {(row.pipeline_from || row.pipeline_to) && (
                  <StageArrow from={row.pipeline_from} to={row.pipeline_to} />
                )}
                {(row.activity_from || row.activity_to) && (
                  <p className="text-[11px] text-muted-foreground">
                    Activity: {[row.activity_from, row.activity_to].filter(Boolean).join(" → ")}
                  </p>
                )}
                {row.notes && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2">{row.notes}</p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => { setPage((p) => p - 1); void fetchData(page - 1); }}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pagination.pages} · {pagination.total} activities
              </span>
              <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => { setPage((p) => p + 1); void fetchData(page + 1); }}>
                Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}

          {pagination && pagination.pages <= 1 && pagination.total > 0 && (
            <p className="text-xs text-muted-foreground text-center">{pagination.total} activities</p>
          )}
        </>
      )}
    </div>
  );
}
