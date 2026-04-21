"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NetProfitRow {
  opp_number: string;
  name: string;
  property_type: string;
  location: string;
  status: string;
  commission_percent: number;
  total_sales_value: number;
  possible_revenue: number;
  closed_revenue: number;
  total_expense: number;
  net_profit: number;
  achievement_pct: number | null;
  won_leads_count: number;
  total_leads_count: number;
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function exportCSV(rows: NetProfitRow[]) {
  const headers = [
    "Opp No", "Opportunity", "Property Type", "Location", "Status",
    "Commission %", "Total Sales Value (₹)", "Possible Revenue (₹)",
    "Closed Revenue (₹)", "Total Expense (₹)", "Net Profit (₹)",
    "Achievement %", "Won Leads", "Total Leads",
  ];
  const lines = rows.map((r) => [
    r.opp_number,
    `"${r.name}"`,
    r.property_type,
    `"${r.location}"`,
    r.status,
    r.commission_percent,
    r.total_sales_value.toFixed(2),
    r.possible_revenue.toFixed(2),
    r.closed_revenue.toFixed(2),
    r.total_expense.toFixed(2),
    r.net_profit.toFixed(2),
    r.achievement_pct != null ? r.achievement_pct.toFixed(1) + "%" : "—",
    r.won_leads_count,
    r.total_leads_count,
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
      totalSalesValue: acc.totalSalesValue + r.total_sales_value,
      possibleRevenue: acc.possibleRevenue + r.possible_revenue,
      closedRevenue: acc.closedRevenue + r.closed_revenue,
      totalExpense: acc.totalExpense + r.total_expense,
      netProfit: acc.netProfit + r.net_profit,
      wonLeads: acc.wonLeads + r.won_leads_count,
    }),
    { totalSalesValue: 0, possibleRevenue: 0, closedRevenue: 0, totalExpense: 0, netProfit: 0, wonLeads: 0 }
  );

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
            <p className="text-xs text-muted-foreground">Possible Revenue</p>
            <p className="text-xl font-semibold">{fmt(totals.possibleRevenue)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Closed Revenue</p>
            <p className="text-xl font-semibold text-emerald-600">{fmt(totals.closedRevenue)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-xl font-semibold text-red-500">{fmt(totals.totalExpense)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={cn("text-xl font-semibold", totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
              {fmt(totals.netProfit)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Won Leads</p>
            <p className="text-xl font-semibold">{totals.wonLeads}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 && fetched ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No opportunities found.</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Opp No</TableHead>
                <TableHead className="text-xs">Opportunity</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Location</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-center">Com %</TableHead>
                <TableHead className="text-xs text-right">Possible Rev</TableHead>
                <TableHead className="text-xs text-right">Closed Rev</TableHead>
                <TableHead className="text-xs text-right">Expenses</TableHead>
                <TableHead className="text-xs text-right">Net Profit</TableHead>
                <TableHead className="text-xs text-center">Achievement</TableHead>
                <TableHead className="text-xs text-center">Won / Total Leads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.opp_number}>
                  <TableCell className="text-xs font-mono">{r.opp_number}</TableCell>
                  <TableCell className="text-xs font-medium max-w-[160px] truncate">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.property_type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{r.location}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-center">{r.commission_percent}%</TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.possible_revenue)}</TableCell>
                  <TableCell className="text-xs text-right font-medium text-emerald-600">{fmt(r.closed_revenue)}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">{r.total_expense > 0 ? fmt(r.total_expense) : "—"}</TableCell>
                  <TableCell className={cn("text-xs text-right font-semibold", r.net_profit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {fmt(r.net_profit)}
                  </TableCell>
                  <TableCell className="text-xs text-center">
                    {r.achievement_pct != null ? (
                      <span className={cn(
                        "font-medium",
                        r.achievement_pct >= 100 ? "text-emerald-600" : r.achievement_pct >= 50 ? "text-amber-600" : "text-red-500"
                      )}>
                        {r.achievement_pct.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-center">{r.won_leads_count} / {r.total_leads_count}</TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={6} className="text-xs">Total ({rows.length} opportunities)</TableCell>
                  <TableCell className="text-xs text-right">{fmt(totals.possibleRevenue)}</TableCell>
                  <TableCell className="text-xs text-right text-emerald-600">{fmt(totals.closedRevenue)}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">{totals.totalExpense > 0 ? fmt(totals.totalExpense) : "—"}</TableCell>
                  <TableCell className={cn("text-xs text-right", totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {fmt(totals.netProfit)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
