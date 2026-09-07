"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentShare { name: string; role: string; amount: number }

interface RevenueRow {
  id: string;
  lead_number: string;
  full_name: string;
  opp_names: string;
  won_date: string | null;
  settlement: number;
  commission_pct: number;
  our_revenue: number;   // settlement × commission %
  agent_payout: number;  // Σ agent commission + incentive
  net_profit: number;    // our_revenue − agent_payout
  agents: AgentShare[];
}

interface PendingRow {
  id: string;
  lead_number: string;
  full_name: string;
  opp_names: string;
  won_date: string | null;
  planned_settlement: number;
  planned_revenue: number;
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
    "Settlement (₹)", "Commission %", "Our Revenue (₹)", "Agent Payout (₹)", "Net Profit (₹)", "Agents",
  ];
  const lines = rows.map((r) => [
    r.lead_number,
    `"${r.full_name}"`,
    `"${r.opp_names}"`,
    fmtDate(r.won_date),
    r.settlement.toFixed(2),
    r.commission_pct,
    r.our_revenue.toFixed(2),
    r.agent_payout.toFixed(2),
    r.net_profit.toFixed(2),
    `"${r.agents.map((a) => `${a.name}: ₹${a.amount}`).join(" · ")}"`,
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
      settlement: acc.settlement + r.settlement,
      revenue: acc.revenue + r.our_revenue,
      payout: acc.payout + r.agent_payout,
      profit: acc.profit + r.net_profit,
    }),
    { settlement: 0, revenue: 0, payout: 0, profit: 0 }
  );
  const pendingRevenue = pending.reduce((s, p) => s + p.planned_revenue, 0);

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

      {/* Summary cards */}
      {fetched && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Deals</p>
            <p className="text-2xl font-semibold">{rows.length}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Settlement</p>
            <p className="text-xl font-semibold">{fmt(totals.settlement)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Our Revenue (settlement × %)</p>
            <p className="text-xl font-semibold">{fmt(totals.revenue)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Agent Payout</p>
            <p className="text-xl font-semibold text-amber-600">{fmt(totals.payout)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={cn("text-xl font-semibold", totals.profit >= 0 ? "text-emerald-600" : "text-red-500")}>{fmt(totals.profit)}</p>
          </div>
        </div>
      )}

      {/* Table — one row per deal */}
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
                <TableHead className="text-xs text-center">Com %</TableHead>
                <TableHead className="text-xs text-right">Our Revenue</TableHead>
                <TableHead className="text-xs text-right">Agent Payout</TableHead>
                <TableHead className="text-xs text-right">Net Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-mono">{r.lead_number}</TableCell>
                  <TableCell className="text-xs font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.opp_names}</TableCell>
                  <TableCell className="text-xs">{fmtDate(r.won_date)}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{fmt(r.settlement)}</TableCell>
                  <TableCell className="text-xs text-center">{r.commission_pct}%</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.our_revenue)}</TableCell>
                  <TableCell className="text-xs text-right text-amber-600">
                    <div>{fmt(r.agent_payout)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.agents.map((a) => `${a.name} ₹${a.amount.toLocaleString("en-IN")}`).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className={cn("text-xs text-right font-semibold", r.net_profit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {fmt(r.net_profit)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={4} className="text-xs">Total ({rows.length} deals)</TableCell>
                <TableCell className="text-xs text-right">{fmt(totals.settlement)}</TableCell>
                <TableCell />
                <TableCell className="text-xs text-right">{fmt(totals.revenue)}</TableCell>
                <TableCell className="text-xs text-right text-amber-600">{fmt(totals.payout)}</TableCell>
                <TableCell className={cn("text-xs text-right", totals.profit >= 0 ? "text-emerald-600" : "text-red-500")}>{fmt(totals.profit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pending (unreconciled) — estimates, kept separate from confirmed totals */}
      {fetched && pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-700">Pending reconciliation — estimates ({pending.length})</h3>
            <span className="text-xs text-amber-700">Estimated revenue: {fmt(pendingRevenue)}</span>
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
                  <TableHead className="text-xs text-right">Est. Revenue</TableHead>
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
                    <TableCell className="text-xs text-right">{fmt(p.planned_revenue)}</TableCell>
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
