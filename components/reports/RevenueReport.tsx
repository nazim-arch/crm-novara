"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface RevenueRow {
  lead_number: string;
  full_name: string;
  opp_names: string;
  opp_numbers: string;
  won_date: string | null;
  settlement_value: number;
  commission_pct: number;
  net_commission: number;
  sales_person_id: string;
  sales_person_name: string;
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
    "Settlement Value (₹)", "Commission %", "Net Commission (₹)",
    "Sales Person",
  ];
  const lines = rows.map((r) => [
    r.lead_number,
    `"${r.full_name}"`,
    `"${r.opp_names}"`,
    fmtDate(r.won_date),
    r.settlement_value,
    r.commission_pct,
    r.net_commission.toFixed(2),
    `"${r.sales_person_name}"`,
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
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Deals Won</p>
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

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 && fetched ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No won deals found for the selected filters.</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Lead No</TableHead>
                <TableHead className="text-xs">Client Name</TableHead>
                <TableHead className="text-xs">Opportunity</TableHead>
                <TableHead className="text-xs">Won Date</TableHead>
                <TableHead className="text-xs text-right">Settlement Value</TableHead>
                <TableHead className="text-xs text-center">Commission %</TableHead>
                <TableHead className="text-xs text-right">Net Commission</TableHead>
                <TableHead className="text-xs">Sales Person</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.lead_number}>
                  <TableCell className="text-xs font-mono">{r.lead_number}</TableCell>
                  <TableCell className="text-xs font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.opp_names}</TableCell>
                  <TableCell className="text-xs">{fmtDate(r.won_date)}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{fmt(r.settlement_value)}</TableCell>
                  <TableCell className="text-xs text-center">{r.commission_pct}%</TableCell>
                  <TableCell className="text-xs text-right font-medium text-emerald-600">{fmt(r.net_commission)}</TableCell>
                  <TableCell className="text-xs">{r.sales_person_name}</TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={4} className="text-xs">Total ({rows.length} deals)</TableCell>
                  <TableCell className="text-xs text-right">{fmt(totals.settlement)}</TableCell>
                  <TableCell />
                  <TableCell className="text-xs text-right text-emerald-600">{fmt(totals.commission)}</TableCell>
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
