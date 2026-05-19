"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";

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

const SOURCE_COLORS: Record<string, string> = {
  Lead: "bg-blue-100 text-blue-700 border-blue-200",
  Opportunity: "bg-purple-100 text-purple-700 border-purple-200",
  Task: "bg-orange-100 text-orange-700 border-orange-200",
  User: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

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

export function AuditLogClient({ users }: Props) {
  const [entityType, setEntityType] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [action, setAction] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (entityType !== "all") params.set("entity_type", entityType);
      if (actorId !== "all") params.set("actor_id", actorId);
      if (action !== "all") params.set("action", action);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/reports/audit-log?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setPagination(json.pagination ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, entityType, actorId, action, dateFrom, dateTo]);

  useEffect(() => { load(1); setPage(1); }, [entityType, actorId, action, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => { setPage(1); load(1); };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end p-4 bg-muted/30 rounded-lg border">
        <div className="space-y-1">
          <Label className="text-xs">Source</Label>
          <Select value={entityType} onValueChange={(v) => setEntityType(v ?? "all")}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="Lead">Lead</SelectItem>
              <SelectItem value="Opportunity">Opportunity</SelectItem>
              <SelectItem value="Task">Task</SelectItem>
              <SelectItem value="User">User</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={action} onValueChange={(v) => setAction(v ?? "all")}>
            <SelectTrigger className="h-8 text-sm w-48">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="stage_changed">Stage Changed</SelectItem>
              <SelectItem value="activity_stage_changed">Activity Stage Changed</SelectItem>
              <SelectItem value="lead_created">Lead Created</SelectItem>
              <SelectItem value="lead_updated">Lead Updated</SelectItem>
              <SelectItem value="task_created">Task Created</SelectItem>
              <SelectItem value="task_updated">Task Updated</SelectItem>
              <SelectItem value="note_added">Note Added</SelectItem>
              <SelectItem value="opportunity_tagged">Opportunity Tagged</SelectItem>
              <SelectItem value="followup_completed">Follow-up Completed</SelectItem>
              <SelectItem value="no_response">No Response</SelectItem>
              <SelectItem value="marked_unreachable">Marked Unreachable</SelectItem>
              <SelectItem value="callback_scheduled">Callback Scheduled</SelectItem>
              <SelectItem value="attempt_call">Call Attempt</SelectItem>
              <SelectItem value="attempt_whatsapp">WhatsApp Attempt</SelectItem>
              <SelectItem value="attempt_email">Email Attempt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Changed By</Label>
          <Select value={actorId} onValueChange={(v) => setActorId(v ?? "all")}>
            <SelectTrigger className="h-8 text-sm w-44">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>

        <Button size="sm" onClick={applyFilters} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Apply
        </Button>

        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => exportCSV(rows)}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          No audit log entries found for the selected filters.
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs w-32">When</TableHead>
                  <TableHead className="text-xs w-28">Source</TableHead>
                  <TableHead className="text-xs">Record</TableHead>
                  <TableHead className="text-xs w-44">Action</TableHead>
                  <TableHead className="text-xs">Old Value</TableHead>
                  <TableHead className="text-xs">New Value</TableHead>
                  <TableHead className="text-xs w-36">Changed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const { date, time } = fmtDate(r.changed_at);
                  const badgeClass = SOURCE_COLORS[r.source] ?? "bg-gray-100 text-gray-700 border-gray-200";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{date}</div>
                        <div className="text-muted-foreground">{time}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs font-medium ${badgeClass}`}>
                          {r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px]">
                        {r.entity_href !== "#" ? (
                          <Link
                            href={r.entity_href}
                            className="text-primary hover:underline truncate block"
                          >
                            {r.entity_label}
                          </Link>
                        ) : (
                          <span className="truncate block">{r.entity_label}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.action_label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                        {r.old_value}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate font-medium">
                        {r.new_value}
                      </TableCell>
                      <TableCell className="text-xs">{r.actor_name}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {((pagination.page - 1) * pagination.page_size) + 1}–
                {Math.min(pagination.page * pagination.page_size, pagination.total)} of{" "}
                {pagination.total} entries
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
