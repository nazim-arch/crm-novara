"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { CommissionStatusBadge } from "./CommissionStatusBadge";
import { commissionStatus } from "@/lib/commission-utils";

interface ReportRow {
  id: string;
  user: { name: string; email: string };
  year: number;
  month: number;
  closed_revenue: number;
  leads_won: number;
  leads_won_no_value: number;
  target_amount: number | null;
  achievement_pct: number | null;
  slab_pct: number | null;
  commission_amount: number | null;
  rec_status: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n: number | null) {
  if (n == null) return "";
  return n.toFixed(2);
}

export function CommissionReport() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sales/commission/report?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(({ data }) =>
        setRows(
          (data ?? []).map((r: ReportRow) => ({
            ...r,
            closed_revenue: Number(r.closed_revenue),
            target_amount: r.target_amount != null ? Number(r.target_amount) : null,
            achievement_pct: r.achievement_pct != null ? Number(r.achievement_pct) : null,
            slab_pct: r.slab_pct != null ? Number(r.slab_pct) : null,
            commission_amount: r.commission_amount != null ? Number(r.commission_amount) : null,
          }))
        )
      )
      .finally(() => setLoading(false));
  }, [year, month]);

  function exportCSV() {
    const headers = [
      "Name", "Email", "Year", "Month", "Closed Revenue", "Leads Won",
      "Leads Won (No Value)", "Target", "Achievement %", "Slab %",
      "Commission", "Status", "Record Status",
    ];
    const rowsCSV = rows.map(r => [
      r.user.name,
      r.user.email,
      r.year,
      MONTHS[r.month - 1],
      fmt(r.closed_revenue),
      r.leads_won,
      r.leads_won_no_value,
      fmt(r.target_amount),
      r.achievement_pct != null ? r.achievement_pct.toFixed(2) : "",
      fmt(r.slab_pct),
      fmt(r.commission_amount),
      commissionStatus(r.achievement_pct),
      r.rec_status,
    ]);

    const csv = [headers, ...rowsCSV]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={month}
          onChange={e => setMonth(parseInt(e.target.value, 10))}
        >
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={year}
          onChange={e => setYear(parseInt(e.target.value, 10))}
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCSV} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-right font-medium">Closed Revenue</th>
              <th className="px-4 py-3 text-right font-medium">Deals Won</th>
              <th className="px-4 py-3 text-right font-medium">Target</th>
              <th className="px-4 py-3 text-right font-medium">Achievement</th>
              <th className="px-4 py-3 text-right font-medium">Slab %</th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-center font-medium">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No commission records for this period
                </td>
              </tr>
            )}
            {rows.map(row => {
              const achPct = row.achievement_pct;
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.user.name}</div>
                    <div className="text-xs text-gray-400">{row.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    ₹{row.closed_revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    {row.leads_won_no_value > 0 && (
                      <span className="block text-xs text-amber-500">{row.leads_won_no_value} missing value</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{row.leads_won}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.target_amount != null
                      ? `₹${row.target_amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {achPct != null ? `${achPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.slab_pct != null ? `${row.slab_pct}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {row.commission_amount != null
                      ? `₹${row.commission_amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CommissionStatusBadge status={commissionStatus(achPct)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${row.rec_status === "Finalized" ? "text-emerald-600" : "text-amber-600"}`}>
                      {row.rec_status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
