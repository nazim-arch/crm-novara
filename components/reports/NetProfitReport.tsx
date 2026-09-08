"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NetProfitRow {
  opp_number: string;
  name: string;
  property_type: string;
  location: string;
  status: string;
  deals: number;
  settlement: number;
  revenue: number;       // Σ settlement × commission %
  agent_payout: number;  // Σ agent commission + incentive
  expenses: number;      // Σ OpportunityExpense
  net_profit: number;    // revenue − agent_payout − expenses
  won_leads_count: number;
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function exportCSV(rows: NetProfitRow[]) {
  const headers = [
    "Opp No", "Opportunity", "Property Type", "Location", "Status", "Deals",
    "Settlement (₹)", "Revenue (₹)", "Agent Payout (₹)", "Expenses (₹)", "Net Profit (₹)",
  ];
  const lines = rows.map((r) => [
    r.opp_number,
    `"${r.name}"`,
    r.property_type,
    `"${r.location}"`,
    r.status,
    r.deals,
    r.settlement.toFixed(2),
    r.revenue.toFixed(2),
    r.agent_payout.toFixed(2),
    r.expenses.toFixed(2),
    r.net_profit.toFixed(2),
  ].join(","));

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `net-profit-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700",
    Inactive: "bg-gray-100 text-gray-600",
    Sold: "bg-violet-100 text-violet-700",
  };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", map[status] ?? "bg-gray-100")}>{status}</span>;
}

export function NetProfitReport() {
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<NetProfitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      const res = await fetch(`/api/reports/net-profit?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      payout: acc.payout + r.agent_payout,
      expenses: acc.expenses + r.expenses,
      netProfit: acc.netProfit + r.net_profit,
    }),
    { revenue: 0, payout: 0, expenses: 0, netProfit: 0 }
  );

  // Opportunities with at least one reconciled deal are the interesting ones; keep all for context.
  const visible = rows;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end p-4 bg-muted/30 rounded-lg border">
        <div className="space-y-1">
          <Label className="text-xs">Opportunity Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
            <SelectTrigger className="h-8 text-sm w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Sold">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={load} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Apply
        </Button>
        {visible.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => exportCSV(visible)}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {/* Summary cards */}
      {fetched && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Revenue (settlement × %)</p>
            <p className="text-xl font-semibold">{fmt(totals.revenue)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Agent Payout</p>
            <p className="text-xl font-semibold text-amber-600">{fmt(totals.payout)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="text-xl font-semibold text-red-500">{fmt(totals.expenses)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={cn("text-xl font-semibold", totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
              {fmt(totals.netProfit)}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 && fetched ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No opportunities found.</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Opp No</TableHead>
                <TableHead className="text-xs">Opportunity</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-center">Deals</TableHead>
                <TableHead className="text-xs text-right">Settlement</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Agent Payout</TableHead>
                <TableHead className="text-xs text-right">Expenses</TableHead>
                <TableHead className="text-xs text-right">Net Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.opp_number}>
                  <TableCell className="text-xs font-mono">{r.opp_number}</TableCell>
                  <TableCell className="text-xs font-medium max-w-[180px] truncate">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.property_type}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-center">{r.deals}</TableCell>
                  <TableCell className="text-xs text-right">{r.settlement > 0 ? fmt(r.settlement) : "—"}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.revenue)}</TableCell>
                  <TableCell className="text-xs text-right text-amber-600">{r.agent_payout > 0 ? fmt(r.agent_payout) : "—"}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">{r.expenses > 0 ? fmt(r.expenses) : "—"}</TableCell>
                  <TableCell className={cn("text-xs text-right font-semibold", r.net_profit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {fmt(r.net_profit)}
                  </TableCell>
                </TableRow>
              ))}
              {visible.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={6} className="text-xs">Total ({visible.length} opportunities)</TableCell>
                  <TableCell className="text-xs text-right">{fmt(totals.revenue)}</TableCell>
                  <TableCell className="text-xs text-right text-amber-600">{fmt(totals.payout)}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">{fmt(totals.expenses)}</TableCell>
                  <TableCell className={cn("text-xs text-right", totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {fmt(totals.netProfit)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
