"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReconciliationDrawer } from "./ReconciliationDrawer";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const STATUSES = ["Pending", "Reconciled", "Cancelled"] as const;
type Status = (typeof STATUSES)[number];

export interface ClosureListItem {
  id: string;
  status: Status;
  planned_settlement_value: string;
  planned_commission_percent: string;
  planned_commission_amount: string;
  actual_settlement_value: string | null;
  settlement_variance: string | null;
  won_year: number;
  won_month: number;
  planned_at: string;
  reconciled_at: string | null;
  lead: { id: string; full_name: string; lead_number: string } | null;
  planned_by: { id: string; name: string } | null;
  reconciled_by: { id: string; name: string } | null;
  agent_shares: {
    id: string;
    agent_id: string;
    role: string | null;
    agent: { id: string; name: string };
  }[];
}

function fmt(n: number | null) {
  if (n == null) return "—";
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const STATUS_BADGE: Record<Status, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Reconciled: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-gray-100 text-gray-500",
};

// Display labels — the "Reconciled" DB status reads as "Closed" in the UI.
const STATUS_LABEL: Record<Status, string> = {
  Pending: "Pending",
  Reconciled: "Closed",
  Cancelled: "Cancelled",
};

export function DealClosuresClient({
  agents,
  currentUserId,
}: {
  agents: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [status, setStatus] = useState<Status>("Pending");
  const [rows, setRows] = useState<ClosureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/sales/deal-closures?status=${status}`)
      .then((r) => r.json())
      .then(({ data }) => setRows(data ?? []))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const primaryAgent = (row: ClosureListItem) =>
    row.agent_shares.find((s) => s.role === "Primary")?.agent.name ??
    row.agent_shares[0]?.agent.name ??
    "—";

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              status === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Lead</th>
              <th className="px-4 py-3 text-left font-medium">Primary agent</th>
              <th className="px-4 py-3 text-center font-medium">Won</th>
              <th className="px-4 py-3 text-right font-medium">Planned settlement</th>
              <th className="px-4 py-3 text-right font-medium">Planned commission</th>
              <th className="px-4 py-3 text-right font-medium">Actual settlement</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No {STATUS_LABEL[status].toLowerCase()} deals.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.lead?.full_name ?? "—"}</div>
                    <div className="text-xs text-gray-400">{row.lead?.lead_number}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {primaryAgent(row)}
                    {row.agent_shares.length > 1 && (
                      <span className="ml-1 text-xs text-gray-400">+{row.agent_shares.length - 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {MONTHS[row.won_month - 1]} {row.won_year}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(Number(row.planned_settlement_value))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(Number(row.planned_commission_amount))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.actual_settlement_value != null ? fmt(Number(row.actual_settlement_value)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[row.status])}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <ReconciliationDrawer
          closureId={selectedId}
          agents={agents}
          currentUserId={currentUserId}
          onClose={() => setSelectedId(null)}
          onSaved={() => {
            setSelectedId(null);
            load();
          }}
        />
      )}
    </div>
  );
}
