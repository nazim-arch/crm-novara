"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  source: string;
  entity_id: string;
  entity_label: string;
  entity_href: string;
  action: string;
  action_label: string;
  old_value: string;
  new_value: string;
  actor_id: string;
  actor_name: string;
  changed_at: string;
}

interface Pagination {
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

interface Props {
  users: { id: string; name: string }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  Lead: "bg-blue-100 text-blue-700 border-blue-200",
  Opportunity: "bg-purple-100 text-purple-700 border-purple-200",
  Task: "bg-orange-100 text-orange-700 border-orange-200",
  User: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const ACTIONS = [
  { value: "stage_changed",            label: "Stage Changed" },
  { value: "activity_stage_changed",   label: "Activity Stage Changed" },
  { value: "lead_created",             label: "Lead Created" },
  { value: "lead_updated",             label: "Lead Updated" },
  { value: "note_added",               label: "Note Added" },
  { value: "opportunity_tagged",       label: "Opportunity Tagged" },
  { value: "task_created",             label: "Task Created" },
  { value: "task_updated",             label: "Task Updated" },
  { value: "followup_completed",       label: "Follow-up Completed" },
  { value: "no_response",              label: "No Response" },
  { value: "marked_unreachable",       label: "Marked Unreachable" },
  { value: "callback_scheduled",       label: "Callback Scheduled" },
  { value: "attempt_call",             label: "Call Attempt" },
  { value: "call_attempted",           label: "Call Attempted" },
  { value: "attempt_whatsapp",         label: "WhatsApp Attempt" },
  { value: "whatsapp_opened",          label: "WhatsApp Opened" },
  { value: "whatsapp_message_sent",    label: "WhatsApp Message Sent" },
  { value: "attempt_email",            label: "Email Attempt" },
  { value: "user_created",             label: "User Created" },
  { value: "user_updated",             label: "User Updated" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

function exportCSV(rows: AuditRow[]) {
  const headers = ["When", "Source", "Record", "Action", "Old Value", "New Value", "Changed By"];
  const lines = rows.map((r) => {
    const { date, time } = fmtDate(r.changed_at);
    return [
      `"${date} ${time}"`,
      r.source,
      `"${r.entity_label}"`,
      `"${r.action_label}"`,
      `"${r.old_value}"`,
      `"${r.new_value}"`,
      `"${r.actor_name}"`,
    ].join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Debounce hook for search inputs that trigger API calls
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AuditLogClient({ users }: Props) {
  // ── API-level filters (trigger reload) ──────────────────────────────────
  const [entityType, setEntityType] = useState("all");
  const [actorId, setActorId]       = useState("all");
  const [action, setAction]         = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [recordQuery, setRecordQuery] = useState("");

  // ── Client-side inline search (filter loaded rows) ──────────────────────
  const [oldValueSearch, setOldValueSearch] = useState("");
  const [newValueSearch, setNewValueSearch] = useState("");

  // ── Pagination & data ────────────────────────────────────────────────────
  const [page, setPage]           = useState(1);
  const [rows, setRows]           = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading]     = useState(false);

  // Debounce record search to avoid firing on every keystroke
  const debouncedRecord = useDebounce(recordQuery, 400);

  // ── Load function ────────────────────────────────────────────────────────
  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (entityType !== "all") params.set("entity_type", entityType);
      if (actorId   !== "all") params.set("actor_id", actorId);
      if (action    !== "all") params.set("action", action);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo)   params.set("date_to", dateTo);
      if (debouncedRecord) params.set("record_query", debouncedRecord);

      const res  = await fetch(`/api/reports/audit-log?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setPagination(json.pagination ?? null);
    } finally {
      setLoading(false);
    }
  }, [entityType, actorId, action, dateFrom, dateTo, debouncedRecord]);

  // Reload when API-level filters change
  useEffect(() => {
    setPage(1);
    load(1);
  }, [entityType, actorId, action, dateFrom, dateTo, debouncedRecord]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when page changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    load(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Client-side filtered rows ─────────────────────────────────────────────
  const filteredRows = rows.filter((r) => {
    if (oldValueSearch && !r.old_value.toLowerCase().includes(oldValueSearch.toLowerCase())) return false;
    if (newValueSearch && !r.new_value.toLowerCase().includes(newValueSearch.toLowerCase())) return false;
    return true;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const actorName = actorId === "all" ? "All Users" : (users.find((u) => u.id === actorId)?.name ?? "All Users");
  const selectedAction = action === "all" ? "All Actions" : (ACTIONS.find((a) => a.value === action)?.label ?? action);

  function clearAll() {
    setEntityType("all"); setActorId("all"); setAction("all");
    setDateFrom(""); setDateTo(""); setRecordQuery("");
    setOldValueSearch(""); setNewValueSearch("");
  }

  const hasFilters = entityType !== "all" || actorId !== "all" || action !== "all" ||
                     dateFrom || dateTo || recordQuery || oldValueSearch || newValueSearch;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Top strip: date range + export ── */}
      <div className="flex flex-wrap gap-3 items-end p-3 bg-muted/30 rounded-lg border">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>

        <div className="flex items-end gap-2 ml-auto">
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-8 text-xs text-muted-foreground">
              <X className="h-3 w-3 mr-1" /> Clear all
            </Button>
          )}
          {rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportCSV(filteredRows)} className="h-8">
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>

                {/* Row 1 — column names */}
                <TableRow className="bg-muted/50 border-b-0">
                  <TableHead className="text-xs w-32 pb-1">When</TableHead>
                  <TableHead className="text-xs w-28 pb-1">Source</TableHead>
                  <TableHead className="text-xs pb-1">Record</TableHead>
                  <TableHead className="text-xs w-52 pb-1">Action</TableHead>
                  <TableHead className="text-xs pb-1">Old Value</TableHead>
                  <TableHead className="text-xs pb-1">New Value</TableHead>
                  <TableHead className="text-xs w-36 pb-1">Changed By</TableHead>
                </TableRow>

                {/* Row 2 — per-column filters */}
                <TableRow className="bg-muted/30 hover:bg-muted/30">

                  {/* When — no column filter, date range is at top */}
                  <TableHead className="py-2 pr-2">
                    <span className="text-[10px] text-muted-foreground italic">date range above</span>
                  </TableHead>

                  {/* Source */}
                  <TableHead className="py-2 pr-2">
                    <Select value={entityType} onValueChange={(v) => setEntityType(v ?? "all")}>
                      <SelectTrigger className="h-7 text-xs w-full border-dashed">
                        <span className="truncate">
                          {entityType === "all" ? "All Sources" : entityType}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        <SelectItem value="Lead">Lead</SelectItem>
                        <SelectItem value="Opportunity">Opportunity</SelectItem>
                        <SelectItem value="Task">Task</SelectItem>
                        <SelectItem value="User">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableHead>

                  {/* Record — server-side search */}
                  <TableHead className="py-2 pr-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Search record…"
                        value={recordQuery}
                        onChange={(e) => setRecordQuery(e.target.value)}
                        className="h-7 text-xs pl-6 border-dashed w-full"
                      />
                      {recordQuery && (
                        <button onClick={() => setRecordQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  </TableHead>

                  {/* Action */}
                  <TableHead className="py-2 pr-2">
                    <Select value={action} onValueChange={(v) => setAction(v ?? "all")}>
                      <SelectTrigger className="h-7 text-xs w-full border-dashed">
                        <span className="truncate">
                          {selectedAction}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="all">All Actions</SelectItem>
                        {ACTIONS.map((a) => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>

                  {/* Old Value — client-side */}
                  <TableHead className="py-2 pr-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Search…"
                        value={oldValueSearch}
                        onChange={(e) => setOldValueSearch(e.target.value)}
                        className="h-7 text-xs pl-6 border-dashed w-full"
                      />
                      {oldValueSearch && (
                        <button onClick={() => setOldValueSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  </TableHead>

                  {/* New Value — client-side */}
                  <TableHead className="py-2 pr-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Search…"
                        value={newValueSearch}
                        onChange={(e) => setNewValueSearch(e.target.value)}
                        className="h-7 text-xs pl-6 border-dashed w-full"
                      />
                      {newValueSearch && (
                        <button onClick={() => setNewValueSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  </TableHead>

                  {/* Changed By */}
                  <TableHead className="py-2 pr-2">
                    <Select value={actorId} onValueChange={(v) => setActorId(v ?? "all")}>
                      <SelectTrigger className="h-7 text-xs w-full border-dashed">
                        {/* Explicit name lookup — prevents showing raw user ID */}
                        <span className="truncate">{actorName}</span>
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="all">All Users</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-sm text-muted-foreground">
                      No audit log entries found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => {
                    const { date, time } = fmtDate(r.changed_at);
                    const badgeClass = SOURCE_COLORS[r.source] ?? "bg-gray-100 text-gray-700 border-gray-200";
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs align-top">
                          <div className="font-medium">{date}</div>
                          <div className="text-muted-foreground">{time}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline" className={`text-xs font-medium ${badgeClass}`}>
                            {r.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs align-top max-w-[220px]">
                          {r.entity_href !== "#" ? (
                            <Link
                              href={r.entity_href}
                              className="text-primary hover:underline break-words"
                            >
                              {r.entity_label}
                            </Link>
                          ) : (
                            <span className="break-words">{r.entity_label}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top">
                          {r.action_label}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top max-w-[160px]">
                          <span className="break-words">{r.old_value}</span>
                        </TableCell>
                        <TableCell className="text-xs font-medium align-top max-w-[160px]">
                          <span className="break-words">{r.new_value}</span>
                        </TableCell>
                        <TableCell className="text-xs align-top font-medium">
                          {r.actor_name}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* ── Pagination + count ── */}
          {pagination && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="text-xs">
                {oldValueSearch || newValueSearch ? (
                  <>
                    <span className="font-medium text-foreground">{filteredRows.length}</span> filtered
                    {" / "}
                  </>
                ) : null}
                {((pagination.page - 1) * pagination.page_size) + 1}–
                {Math.min(pagination.page * pagination.page_size, pagination.total)} of{" "}
                <span className="font-medium text-foreground">{pagination.total.toLocaleString()}</span> entries
              </span>

              {pagination.pages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="icon" className="h-7 w-7"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 text-xs">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <Button
                    variant="outline" size="icon" className="h-7 w-7"
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
