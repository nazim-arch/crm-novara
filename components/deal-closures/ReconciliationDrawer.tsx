"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X, Info } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface SlabRow { from_amount: number; to_amount: number | null; commission_pct: number }

interface ShareState {
  agent_id: string;
  agent_name: string;
  role: string;
  planned_commission_amount: number | null;
  actual_commission_amount: string;
  incentive_amount: string;
}

interface Detail {
  id: string;
  status: "Pending" | "Reconciled" | "Cancelled";
  planned_settlement_value: string;
  planned_commission_percent: string;
  planned_commission_amount: string;
  actual_settlement_value: string | null;
  won_year: number;
  won_month: number;
  notes: string | null;
  reconciled_at: string | null;
  lead: { id: string; full_name: string; lead_number: string } | null;
  planned_by: { id: string; name: string } | null;
  reconciled_by: { id: string; name: string } | null;
  agent_shares: {
    id: string;
    agent_id: string;
    role: string | null;
    planned_commission_amount: string | null;
    actual_commission_amount: string | null;
    incentive_amount: string;
    agent: { id: string; name: string };
  }[];
}

function fmtMoney(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Client replica of lib/sales-commission.calcCommission — for the read-only slab hint only. */
function slabCommission(basis: number, slabs: SlabRow[]): number | null {
  if (!slabs.length || basis <= 0) return null;
  for (const s of slabs) {
    const to = s.to_amount ?? Infinity;
    if (basis >= s.from_amount && basis < to) return (basis * s.commission_pct) / 100;
  }
  const top = slabs[slabs.length - 1];
  return (basis * top.commission_pct) / 100;
}

export function ReconciliationDrawer({
  closureId,
  agents,
  currentUserId,
  onClose,
  onSaved,
}: {
  closureId: string;
  agents: { id: string; name: string }[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [slabs, setSlabs] = useState<Record<string, SlabRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [actualSettlement, setActualSettlement] = useState("");
  const [shares, setShares] = useState<ShareState[]>([]);
  const [notes, setNotes] = useState("");
  const [addingAgentId, setAddingAgentId] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sales/deal-closures/${closureId}`)
      .then((r) => r.json())
      .then(({ data, agent_slabs }: { data: Detail; agent_slabs: Record<string, SlabRow[]> }) => {
        setDetail(data);
        setSlabs(agent_slabs ?? {});
        setActualSettlement(data.actual_settlement_value ?? "");
        setNotes(data.notes ?? "");
        setShares(
          data.agent_shares.map((s) => ({
            agent_id: s.agent_id,
            agent_name: s.agent.name,
            role: s.role ?? "",
            planned_commission_amount:
              s.planned_commission_amount != null ? Number(s.planned_commission_amount) : null,
            actual_commission_amount: s.actual_commission_amount ?? "",
            incentive_amount: s.incentive_amount ?? "0",
          })),
        );
      })
      .finally(() => setLoading(false));
  }, [closureId]);

  const plannedSettlement = detail ? Number(detail.planned_settlement_value) : 0;
  const plannedPct = detail ? Number(detail.planned_commission_percent) : 0;
  const isReconciled = detail?.status === "Reconciled";
  const isCancelled = detail?.status === "Cancelled";
  const isSameAdmin = isReconciled && detail?.reconciled_by?.id === currentUserId;
  const readOnly = isCancelled || isSameAdmin;

  const settlementVariance = useMemo(() => {
    if (actualSettlement === "" || detail == null) return null;
    return Number(actualSettlement) - plannedSettlement;
  }, [actualSettlement, plannedSettlement, detail]);

  const totalActual = shares.reduce(
    (s, r) => s + (r.actual_commission_amount === "" ? 0 : Number(r.actual_commission_amount)) + (r.incentive_amount === "" ? 0 : Number(r.incentive_amount)),
    0,
  );

  function updateShare(agentId: string, patch: Partial<ShareState>) {
    setShares((prev) => prev.map((s) => (s.agent_id === agentId ? { ...s, ...patch } : s)));
  }
  function removeShare(agentId: string) {
    setShares((prev) => prev.filter((s) => s.agent_id !== agentId));
  }
  function addAgent() {
    if (!addingAgentId) return;
    if (shares.some((s) => s.agent_id === addingAgentId)) {
      toast.error("That agent is already on this deal.");
      return;
    }
    const a = agents.find((x) => x.id === addingAgentId);
    if (!a) return;
    setShares((prev) => [
      ...prev,
      { agent_id: a.id, agent_name: a.name, role: "Co-agent", planned_commission_amount: null, actual_commission_amount: "", incentive_amount: "0" },
    ]);
    setAddingAgentId("");
  }

  async function submit(markReconciled: boolean) {
    if (!detail) return;
    if (markReconciled) {
      if (actualSettlement === "") return toast.error("Enter the actual settlement value to reconcile.");
      if (shares.length === 0) return toast.error("Add at least one agent.");
      if (shares.some((s) => s.actual_commission_amount === ""))
        return toast.error("Every agent needs an actual commission amount to reconcile.");
    }
    if (isReconciled && !notes.trim())
      return toast.error("Add a note explaining the change to a reconciled closure.");

    setSaving(true);
    const res = await fetch(`/api/sales/deal-closures/${closureId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actual_settlement_value: actualSettlement === "" ? null : Number(actualSettlement),
        shares: shares.map((s) => ({
          agent_id: s.agent_id,
          role: s.role || null,
          actual_commission_amount: s.actual_commission_amount === "" ? null : Number(s.actual_commission_amount),
          incentive_amount: s.incentive_amount === "" ? 0 : Number(s.incentive_amount),
        })),
        notes: notes.trim() || null,
        status: markReconciled ? "Reconciled" : "Pending",
      }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success(markReconciled ? "Deal reconciled." : "Draft saved.");
      onSaved();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Could not save. Please try again.");
    }
  }

  return (
    <Drawer open direction="right" onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="w-full sm:!max-w-2xl">
        <DrawerHeader className="border-b">
          <DrawerTitle>Reconcile deal closure</DrawerTitle>
          <DrawerDescription>
            {detail?.lead
              ? `${detail.lead.full_name} · ${detail.lead.lead_number}`
              : "Loading…"}
            {detail ? ` · Won ${MONTHS[detail.won_month - 1]} ${detail.won_year}` : ""}
          </DrawerDescription>
        </DrawerHeader>

        {loading || !detail ? (
          <div className="flex flex-1 items-center justify-center p-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {isSameAdmin && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                You reconciled this deal. A different admin must review and modify it (maker-checker).
              </div>
            )}
            {isCancelled && (
              <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-500">
                This closure was cancelled (the lead was reverted out of Won). It is read-only.
              </div>
            )}

            {/* Planned baseline */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-gray-50/60 p-3 text-sm">
              <div>
                <div className="text-xs text-gray-500">Planned settlement</div>
                <div className="font-medium">{fmtMoney(plannedSettlement)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Planned commission ({plannedPct}%)</div>
                <div className="font-medium">{fmtMoney(Number(detail.planned_commission_amount))}</div>
              </div>
              <div className="col-span-2 text-xs text-gray-400">
                Estimated by {detail.planned_by?.name ?? "—"}
                {detail.reconciled_by ? ` · Last reconciled by ${detail.reconciled_by.name}` : ""}
              </div>
            </div>

            {/* Actual settlement + variance */}
            <div className="space-y-1.5">
              <Label htmlFor="actual_settlement">
                Actual Settlement Value (₹) {!readOnly && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="actual_settlement"
                type="number"
                disabled={readOnly}
                placeholder="e.g. 7200000"
                value={actualSettlement}
                onChange={(e) => setActualSettlement(e.target.value)}
              />
              {settlementVariance != null && (
                <p className={cn("text-xs", settlementVariance === 0 ? "text-gray-500" : settlementVariance > 0 ? "text-emerald-600" : "text-red-600")}>
                  Variance vs plan: {settlementVariance >= 0 ? "+" : ""}{fmtMoney(settlementVariance)}
                  {plannedSettlement !== 0 && ` (${((settlementVariance / plannedSettlement) * 100).toFixed(1)}%)`}
                </p>
              )}
            </div>

            {/* Per-agent commission table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Agent commission</Label>
                <span className="text-xs text-gray-400">Commission + incentive entered manually</span>
              </div>

              <div className="space-y-3">
                {shares.map((s) => {
                  const actual = s.actual_commission_amount === "" ? null : Number(s.actual_commission_amount);
                  const commissionVariance =
                    s.planned_commission_amount != null && actual != null
                      ? actual - s.planned_commission_amount
                      : null;
                  const hintBasis = actualSettlement === "" ? 0 : (Number(actualSettlement) * plannedPct) / 100;
                  const hint = slabCommission(hintBasis, slabs[s.agent_id] ?? []);
                  return (
                    <div key={s.agent_id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{s.agent_name}</div>
                        {!readOnly && shares.length > 1 && (
                          <button
                            onClick={() => removeShare(s.agent_id)}
                            className="text-gray-400 hover:text-red-500"
                            title="Remove agent"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-gray-500">Role</Label>
                          <Input
                            disabled={readOnly}
                            value={s.role}
                            placeholder="Primary / Co-agent"
                            onChange={(e) => updateShare(s.agent_id, { role: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Commission (₹)</Label>
                          <Input
                            type="number"
                            disabled={readOnly}
                            value={s.actual_commission_amount}
                            onChange={(e) => updateShare(s.agent_id, { actual_commission_amount: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Incentive (₹)</Label>
                          <Input
                            type="number"
                            disabled={readOnly}
                            value={s.incentive_amount}
                            onChange={(e) => updateShare(s.agent_id, { incentive_amount: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                        <span>
                          Planned:{" "}
                          {s.planned_commission_amount != null ? fmtMoney(s.planned_commission_amount) : "—"}
                        </span>
                        <span>
                          Variance:{" "}
                          {commissionVariance != null ? (
                            <span className={commissionVariance >= 0 ? "text-emerald-600" : "text-red-600"}>
                              {commissionVariance >= 0 ? "+" : ""}{fmtMoney(commissionVariance)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </span>
                        {hint != null && <span>Slab hint: ~{fmtMoney(hint)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!readOnly && (
                <div className="flex items-center gap-2 pt-1">
                  <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={addingAgentId}
                    onChange={(e) => setAddingAgentId(e.target.value)}
                  >
                    <option value="">Add agent…</option>
                    {agents
                      .filter((a) => !shares.some((s) => s.agent_id === a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                  </select>
                  <Button variant="outline" size="sm" onClick={addAgent} disabled={!addingAgentId}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              )}

              <div className="flex justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Total payout (commission + incentive)</span>
                <span className="font-semibold tabular-nums">{fmtMoney(totalActual)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notes {isReconciled && !readOnly && <span className="text-destructive">*</span>}
              </Label>
              <textarea
                id="notes"
                disabled={readOnly}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={isReconciled ? "Explain the change you're making…" : "Optional notes"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        <DrawerFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!readOnly && detail && (
            <>
              <Button variant="outline" onClick={() => submit(false)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}
              </Button>
              <Button onClick={() => submit(true)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reconcile"}
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
