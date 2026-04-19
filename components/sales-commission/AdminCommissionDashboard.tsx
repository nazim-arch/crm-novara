"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommissionStatusBadge } from "./CommissionStatusBadge";
import { commissionStatus } from "@/lib/sales-commission";
import { cn } from "@/lib/utils";

interface ReportRow {
  id: string;
  user_id: string;
  year: number;
  month: number;
  closed_revenue: number;
  leads_won: number;
  target_amount: number | null;
  achievement_pct: number | null;
  commission_amount: number | null;
  slab_pct: number | null;
  rec_status: string;
  user: { id: string; name: string; short_name: string };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n: number | null) {
  if (n == null) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

interface Props {
  salesUsers: { id: string; name: string }[];
}

export function AdminCommissionDashboard({ salesUsers }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    const res = await fetch(`/api/sales/commission/report?year=${year}&month=${month}`);
    if (res.ok) {
      const { data } = await res.json();
      setRows(
        (data ?? []).map((r: ReportRow) => ({
          ...r,
          closed_revenue: Number(r.closed_revenue),
          target_amount: r.target_amount != null ? Number(r.target_amount) : null,
          achievement_pct: r.achievement_pct != null ? Number(r.achievement_pct) : null,
          commission_amount: r.commission_amount != null ? Number(r.commission_amount) : null,
          slab_pct: r.slab_pct != null ? Number(r.slab_pct) : null,
        }))
      );
    }
    setLoading(false);
  }

  useEffect(() => { loadReport(); }, [year, month]); // eslint-disable-line

  async function recalcUser(userId: string) {
    setRefreshing(userId);
    await fetch(`/api/sales/commission/calculate?user_id=${userId}&year=${year}&month=${month}`);
    await loadReport();
    setRefreshing(null);
  }

  async function finalizeRecord(id: string) {
    await fetch(`/api/sales/commission/records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rec_status: "Finalized" }),
    });
    await loadReport();
  }

  const totalRevenue = rows.reduce((s, r) => s + r.closed_revenue, 0);
  const totalCommission = rows.reduce((s, r) => s + (r.commission_amount ?? 0), 0);

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

        <div className="ml-auto flex gap-4 text-sm">
          <span className="text-gray-500">Total revenue: <strong>{fmt(totalRevenue)}</strong></span>
          <span className="text-gray-500">Total commission: <strong>{fmt(totalCommission)}</strong></span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Sales Rep</th>
              <th className="px-4 py-3 text-right font-medium">Closed Revenue</th>
              <th className="px-4 py-3 text-right font-medium">Target</th>
              <th className="px-4 py-3 text-right font-medium">Achievement</th>
              <th className="px-4 py-3 text-right font-medium">Slab %</th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No records for this period. Recalculate to generate.
                </td>
              </tr>
            )}
            {rows.map(row => {
              const achPct = row.achievement_pct;
              const status = commissionStatus(achPct);
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.user.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.closed_revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.target_amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {achPct != null ? (
                      <span className={cn(
                        "font-medium",
                        achPct >= 100 ? "text-emerald-600" : achPct >= 80 ? "text-amber-600" : "text-red-600"
                      )}>
                        {achPct.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.slab_pct != null ? `${row.slab_pct}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(row.commission_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <CommissionStatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => recalcUser(row.user_id)}
                        disabled={refreshing === row.user_id || row.rec_status === "Finalized"}
                      >
                        {refreshing === row.user_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                      </Button>
                      {row.rec_status !== "Finalized" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => finalizeRecord(row.id)}
                        >
                          Finalize
                        </Button>
                      )}
                      {row.rec_status === "Finalized" && (
                        <span className="text-xs text-gray-400">Locked</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Recalc all for users with no record yet */}
            {salesUsers
              .filter(u => !rows.find(r => r.user_id === u.id))
              .map(u => (
                <tr key={u.id} className="bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-400">{u.name}</td>
                  <td colSpan={6} className="px-4 py-3 text-xs text-gray-400">No record yet</td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => recalcUser(u.id)}
                      disabled={refreshing === u.id}
                    >
                      {refreshing === u.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : "Calculate"}
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
