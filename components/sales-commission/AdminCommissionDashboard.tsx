"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommissionStatusBadge } from "./CommissionStatusBadge";
import { commissionStatus } from "@/lib/commission-utils";
import { cn } from "@/lib/utils";

export interface CommissionRowData {
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

interface Props {
  salesUsers: { id: string; name: string }[];
  initialRows: CommissionRowData[];
  rangeLabel: string;
  multiMonth: boolean;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n: number | null) {
  if (n == null) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function AdminCommissionDashboard({ salesUsers, initialRows, rangeLabel, multiMonth }: Props) {
  const [rows, setRows] = useState<CommissionRowData[]>(initialRows);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState<string | null>(null);

  async function recalcUser(row: CommissionRowData) {
    setRefreshing(row.id);
    const res = await fetch(
      `/api/sales/commission/calculate?user_id=${row.user_id}&year=${row.year}&month=${row.month}`
    );
    if (res.ok) {
      const { data } = await res.json();
      if (data) {
        setRows(prev => prev.map(r => r.id === row.id ? {
          ...r,
          closed_revenue: Number(data.closed_revenue),
          target_amount: data.target_amount != null ? Number(data.target_amount) : null,
          achievement_pct: data.achievement_pct != null ? Number(data.achievement_pct) : null,
          commission_amount: data.commission_amount != null ? Number(data.commission_amount) : null,
          slab_pct: data.slab_pct != null ? Number(data.slab_pct) : null,
          rec_status: data.rec_status,
        } : r));
      }
    }
    setRefreshing(null);
  }

  async function finalizeRecord(id: string) {
    setFinalizing(id);
    const res = await fetch(`/api/sales/commission/records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rec_status: "Finalized" }),
    });
    if (res.ok) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, rec_status: "Finalized" } : r));
    }
    setFinalizing(null);
  }

  const totalRevenue = rows.reduce((s, r) => s + r.closed_revenue, 0);
  const totalCommission = rows.reduce((s, r) => s + (r.commission_amount ?? 0), 0);
  const totalDeals = rows.reduce((s, r) => s + r.leads_won, 0);

  // Multi-month: group by user, aggregate totals
  if (multiMonth) {
    const byUser = new Map<string, { user: CommissionRowData["user"]; months: CommissionRowData[] }>();
    for (const row of rows) {
      const existing = byUser.get(row.user_id);
      if (existing) existing.months.push(row);
      else byUser.set(row.user_id, { user: row.user, months: [row] });
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{rangeLabel}</span>
          <div className="flex gap-4">
            <span>Total revenue: <strong className="text-gray-900">{fmt(totalRevenue)}</strong></span>
            <span>Total commission: <strong className="text-gray-900">{fmt(totalCommission)}</strong></span>
            <span>Total deals: <strong className="text-gray-900">{totalDeals}</strong></span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Sales Rep</th>
                <th className="px-4 py-3 text-center font-medium">Period</th>
                <th className="px-4 py-3 text-right font-medium">Revenue</th>
                <th className="px-4 py-3 text-right font-medium">Deals</th>
                <th className="px-4 py-3 text-right font-medium">Target</th>
                <th className="px-4 py-3 text-right font-medium">Achievement</th>
                <th className="px-4 py-3 text-right font-medium">Commission</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No commission records for this period
                  </td>
                </tr>
              )}
              {rows
                .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.user.name.localeCompare(b.user.name))
                .map(row => {
                  const achPct = row.achievement_pct;
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.user.name}</td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">
                        {MONTHS[row.month - 1]} {row.year}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(row.closed_revenue)}</td>
                      <td className="px-4 py-3 text-right">{row.leads_won}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(row.target_amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {achPct != null ? (
                          <span className={cn("font-medium", achPct >= 100 ? "text-emerald-600" : achPct >= 80 ? "text-amber-600" : "text-red-600")}>
                            {achPct.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(row.commission_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <CommissionStatusBadge status={commissionStatus(achPct)} />
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

  // Single month: detailed view with recalculate + finalize
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{rangeLabel}</span>
        <div className="flex gap-4">
          <span>Total revenue: <strong className="text-gray-900">{fmt(totalRevenue)}</strong></span>
          <span>Total commission: <strong className="text-gray-900">{fmt(totalCommission)}</strong></span>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No records — click Calculate on each user to generate.
                </td>
              </tr>
            )}
            {rows.map(row => {
              const achPct = row.achievement_pct;
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.user.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.closed_revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.target_amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {achPct != null ? (
                      <span className={cn("font-medium", achPct >= 100 ? "text-emerald-600" : achPct >= 80 ? "text-amber-600" : "text-red-600")}>
                        {achPct.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{row.slab_pct != null ? `${row.slab_pct}%` : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(row.commission_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <CommissionStatusBadge status={commissionStatus(achPct)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => recalcUser(row)}
                        disabled={refreshing === row.id || row.rec_status === "Finalized"}
                      >
                        {refreshing === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      </Button>
                      {row.rec_status !== "Finalized" ? (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                          onClick={() => finalizeRecord(row.id)}
                          disabled={finalizing === row.id}
                        >
                          {finalizing === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Finalize"}
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">Locked</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Users with no record yet */}
            {salesUsers
              .filter(u => !rows.find(r => r.user_id === u.id))
              .map(u => (
                <tr key={u.id} className="bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-400">{u.name}</td>
                  <td colSpan={6} className="px-4 py-3 text-xs text-gray-400">No record yet</td>
                  <td className="px-4 py-3 text-center">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                      onClick={() => {/* will be filled via recalcUser after row exists */}}
                    >
                      Calculate
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
