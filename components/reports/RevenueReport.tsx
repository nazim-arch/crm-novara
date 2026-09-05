"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";

interface RevenueRow {
  id: string;
  lead_number: string;
  full_name: string;
  opp_names: string;
  opp_numbers: string;
  won_date: string | null;
  settlement_value: number;
  agent_id: string;
  agent_name: string;
  role: string;
  commission_amount: number;
  incentive_amount: number;
  net_commission: number;
}

interface PendingRow {
  id: string;
  lead_number: string;
  full_name: string;
  opp_names: string;
  won_date: string | null;
  planned_settlement: number;
  planned_commission: number;
  agent_name: string;
}

interface Props {
  salesUsers: { id: string; name: string }[];
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function exportCSV(rows: RevenueRow[]) {
  const headers = [
    "Lead No", "Client Name", "Opportunity", "Won Date",
    "Settlement Value (₹)", "Agent", "Role", "Commission (₹)", "Incentive (₹)", "Net Commission (₹)",
  ];
  const lines = rows.map((r) => [
    r.lead_number,
    `"${r.full_name}"`,
    `"${r.opp_names}"`,
    fmtDate(r.won_date),
    r.settlement_value,
    `"${r.agent_name}"`,
    `"${r.role}"`,
    r.commission_amount.toFixed(2),
    r.incentive_amount.toFixed(2),
    r.net_commission.toFixed(2),
  ].join(","));

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RevenueReport({ salesUsers }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("all");
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (userId !== "all") params.set("user_id", userId);
      const res = await fetch(`/api/reports/revenue?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setPending(json.pending ?? []);
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, [from, to, userId]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      settlement: acc.settlement + r.settlement_value,
      commission: acc.commission + r.net_commission,
    }),
    { settlement: 0, commission: 0 }
  );
  const pendingTotal = pending.reduce((s, p) => s + p.planned_commission, 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end p-4 bg-muted/30 rounded-lg border">
        <div className="space-y-1">
          <Label className="text-xs">From (Won Date)</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To (Won Date)</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sales Person</Label>
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "all")}>
            <SelectTrigger className="h-8 text-sm w-44">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {salesUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={load} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Apply
        </Button>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => exportCSV(rows)}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {/* Summary cards — confirmed (reconciled) numbers only */}
      {fetched && (
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Agent Payouts (reconciled)</p>
            <p className="text-2xl font-semibold">{rows.length}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Settlement Value</p>
            <p className="text-2xl font-semibold">{fmt(totals.settlement)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Net Commission</p>
            <p className="text-2xl font-semibold text-emerald-600">{fmt(totals.commission)}</p>
          </div>
        </div>
      )}

      {/* Confirmed table — one row per agent share */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 && fetched ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No reconciled deals found for the selected filters.</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Lead No</TableHead>
                <TableHead className="text-xs">Client Name</TableHead>
                <TableHead className="text-xs">Opportunity</TableHead>
                <TableHead className="text-xs">Won Date</TableHead>
                <TableHead className="text-xs text-right">Settlement</TableHead>
                <TableHead className="text-xs">Agent</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs text-right">Commission</TableHead>
                <TableHead className="text-xs text-right">Incentive</TableHead>
                <TableHead className="text-xs text-right">Net Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-mono">{r.lead_number}</TableCell>
                  <TableCell className="text-xs font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.opp_names}</TableCell>
                  <TableCell className="text-xs">{fmtDate(r.won_date)}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{fmt(r.settlement_value)}</TableCell>
                  <TableCell className="text-xs">{r.agent_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.role}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.commission_amount)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.incentive_amount)}</TableCell>
                  <TableCell className="text-xs text-right font-medium text-emerald-600">{fmt(r.net_commission)}</TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={4} className="text-xs">Total ({rows.length} payouts)</TableCell>
                  <TableCell className="text-xs text-right">{fmt(totals.settlement)}</TableCell>
                  <TableCell colSpan={4} />
                  <TableCell className="text-xs text-right text-emerald-600">{fmt(totals.commission)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pending (unreconciled) — estimates, kept separate from confirmed totals */}
      {fetched && pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-700">
              Pending reconciliation — estimates ({pending.length})
            </h3>
            <span className="text-xs text-amber-700">Estimated commission: {fmt(pendingTotal)}</span>
          </div>
          <div className="border border-amber-200 rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50/60">
                  <TableHead className="text-xs">Lead No</TableHead>
                  <TableHead className="text-xs">Client Name</TableHead>
                  <TableHead className="text-xs">Opportunity</TableHead>
                  <TableHead className="text-xs">Won Date</TableHead>
                  <TableHead className="text-xs">Agent</TableHead>
                  <TableHead className="text-xs text-right">Est. Settlement</TableHead>
                  <TableHead className="text-xs text-right">Est. Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-mono">{p.lead_number}</TableCell>
                    <TableCell className="text-xs font-medium">{p.full_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.opp_names}</TableCell>
                    <TableCell className="text-xs">{fmtDate(p.won_date)}</TableCell>
                    <TableCell className="text-xs">{p.agent_name}</TableCell>
                    <TableCell className="text-xs text-right">{fmt(p.planned_settlement)}</TableCell>
                    <TableCell className="text-xs text-right">{fmt(p.planned_commission)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
