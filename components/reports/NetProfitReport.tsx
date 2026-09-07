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
  commission_percent: number;
  total_sales_value: number;
  possible_revenue: number;
  closed_revenue: number;
  total_expense: number;
  net_profit: number;
  achievement_pct: number | null;
  won_leads_count: number;
  total_leads_count: number;
  // Expected-vs-actual comparison
  actual_settlement: number;
  settlement_variance: number;
  anticipated_commission: number;
  actual_commission: number;
  commission_variance: number;
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Small +/- variance line, coloured (positive = green, negative = red). */
function Variance({ n }: { n: number }) {
  if (n === 0) return <span className="text-[10px] text-gray-400">±0</span>;
  const pos = n > 0;
  return (
    <span className={cn("text-[10px]", pos ? "text-emerald-600" : "text-red-500")}>
      {pos ? "+" : ""}{fmt(n)}
    </span>
  );
}

function exportCSV(rows: NetProfitRow[]) {
  const headers = [
    "Opp No", "Opportunity", "Property Type", "Location", "Status", "Commission %",
    "Sale Value (₹)", "Actual Settlement (₹)", "Settlement Variance (₹)",
    "Anticipated Commission (₹)", "Actual Commission (₹)", "Commission Variance (₹)",
    "Total Expense (₹)", "Net Profit (₹)", "Achievement %", "Won Leads", "Total Leads",
  ];
  const lines = rows.map((r) => [
    r.opp_number,
    `"${r.name}"`,
    r.property_type,
    `"${r.location}"`,
    r.status,
    r.commission_percent,
    r.total_sales_value.toFixed(2),
    r.actual_settlement.toFixed(2),
    r.settlement_variance.toFixed(2),
    r.anticipated_commission.toFixed(2),
    r.actual_commission.toFixed(2),
    r.commission_variance.toFixed(2),
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
      saleValue: acc.saleValue + r.total_sales_value,
      settled: acc.settled + r.actual_settlement,
      anticipated: acc.anticipated + r.anticipated_commission,
      actual: acc.actual + r.actual_commission,
      totalExpense: acc.totalExpense + r.total_expense,
      netProfit: acc.netProfit + r.net_profit,
      wonLeads: acc.wonLeads + r.won_leads_count,
    }),
    { saleValue: 0, settled: 0, anticipated: 0, actual: 0, totalExpense: 0, netProfit: 0, wonLeads: 0 }
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

      {/* Summary cards — expected vs actual */}
      {fetched && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Anticipated Commission</p>
            <p className="text-xl font-semibold">{fmt(totals.anticipated)}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Actual Commission</p>
            <p className="text-xl font-semibold text-emerald-600">{fmt(totals.actual)}</p>
            <p className="mt-0.5"><Variance n={totals.actual - totals.anticipated} /></p>
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
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-center">Com %</TableHead>
                <TableHead className="text-xs text-right">Sale Value</TableHead>
                <TableHead className="text-xs text-right">Settled</TableHead>
                <TableHead className="text-xs text-right">Anticipated Comm</TableHead>
                <TableHead className="text-xs text-right">Actual Comm</TableHead>
                <TableHead className="text-xs text-right">Expenses</TableHead>
                <TableHead className="text-xs text-right">Net Profit</TableHead>
                <TableHead className="text-xs text-center">Won / Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.opp_number}>
                  <TableCell className="text-xs font-mono">{r.opp_number}</TableCell>
                  <TableCell className="text-xs font-medium max-w-[160px] truncate">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.property_type}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-center">{r.commission_percent}%</TableCell>
                  <TableCell className="text-xs text-right">{r.total_sales_value > 0 ? fmt(r.total_sales_value) : "—"}</TableCell>
                  <TableCell className="text-xs text-right">
                    <div>{r.actual_settlement > 0 ? fmt(r.actual_settlement) : "—"}</div>
                    {r.actual_settlement > 0 && r.total_sales_value > 0 && <Variance n={r.settlement_variance} />}
                  </TableCell>
                  <TableCell className="text-xs text-right">{fmt(r.anticipated_commission)}</TableCell>
                  <TableCell className="text-xs text-right font-medium text-emerald-600">
                    <div>{fmt(r.actual_commission)}</div>
                    {r.anticipated_commission > 0 && <Variance n={r.commission_variance} />}
                  </TableCell>
                  <TableCell className="text-xs text-right text-red-500">{r.total_expense > 0 ? fmt(r.total_expense) : "—"}</TableCell>
                  <TableCell className={cn("text-xs text-right font-semibold", r.net_profit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {fmt(r.net_profit)}
                  </TableCell>
                  <TableCell className="text-xs text-center">{r.won_leads_count} / {r.total_leads_count}</TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={5} className="text-xs">Total ({rows.length} opportunities)</TableCell>
                  <TableCell className="text-xs text-right">{fmt(totals.saleValue)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(totals.settled)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(totals.anticipated)}</TableCell>
                  <TableCell className="text-xs text-right text-emerald-600">{fmt(totals.actual)}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">{totals.totalExpense > 0 ? fmt(totals.totalExpense) : "—"}</TableCell>
                  <TableCell className={cn("text-xs text-right", totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {fmt(totals.netProfit)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
