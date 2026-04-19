"use client";

import { useState, useEffect } from "react";
import { Loader2, TrendingUp, Target, IndianRupee, Trophy } from "lucide-react";
import { CommissionStatusBadge } from "./CommissionStatusBadge";
import { commissionStatus } from "@/lib/commission-utils";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  userName: string;
}

interface CommissionRecord {
  id: string;
  year: number;
  month: number;
  closed_revenue: number;
  leads_won: number;
  leads_won_no_value: number;
  target_amount: number | null;
  achievement_pct: number | null;
  commission_amount: number | null;
  slab_pct: number | null;
  rec_status: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n: number | null) {
  if (n == null) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function SalesCommissionDashboard({ userId, userName }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [record, setRecord] = useState<CommissionRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sales/commission/calculate?user_id=${userId}&year=${year}&month=${month}`)
      .then(r => r.json())
      .then(({ data }) => {
        if (data) {
          setRecord({
            ...data,
            closed_revenue: Number(data.closed_revenue),
            target_amount: data.target_amount != null ? Number(data.target_amount) : null,
            achievement_pct: data.achievement_pct != null ? Number(data.achievement_pct) : null,
            commission_amount: data.commission_amount != null ? Number(data.commission_amount) : null,
            slab_pct: data.slab_pct != null ? Number(data.slab_pct) : null,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [userId, year, month]);

  const achPct = record?.achievement_pct ?? null;
  const status = commissionStatus(achPct);

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-3">
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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          icon={<IndianRupee className="h-4 w-4" />}
          label="Closed Revenue"
          value={fmt(record?.closed_revenue ?? null)}
          sub={record ? `${record.leads_won} deal${record.leads_won !== 1 ? "s" : ""}` : ""}
          color="violet"
        />
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label="Monthly Target"
          value={fmt(record?.target_amount ?? null)}
          sub={achPct != null ? `${achPct.toFixed(1)}% achieved` : "No target set"}
          color="blue"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Commission"
          value={fmt(record?.commission_amount ?? null)}
          sub={record?.slab_pct != null ? `${record.slab_pct}% slab` : "—"}
          color="emerald"
        />
        <KpiCard
          icon={<Trophy className="h-4 w-4" />}
          label="Status"
          value={<CommissionStatusBadge status={status} />}
          sub={record?.rec_status === "Finalized" ? "Finalized" : "Live"}
          color="amber"
        />
      </div>

      {/* Achievement bar */}
      {achPct != null && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Achievement</span>
            <span>{achPct.toFixed(1)}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                achPct >= 100 ? "bg-emerald-500" : achPct >= 80 ? "bg-amber-400" : "bg-red-400"
              )}
              style={{ width: `${Math.min(achPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {record?.leads_won_no_value ? (
        <p className="text-xs text-amber-600">
          {record.leads_won_no_value} won deal{record.leads_won_no_value !== 1 ? "s" : ""} missing settlement value — not counted in revenue
        </p>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub: string;
  color: "violet" | "blue" | "emerald" | "amber";
}) {
  const colors = {
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className={cn("inline-flex items-center justify-center h-8 w-8 rounded-lg mb-3", colors[color])}>
        {icon}
      </div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
