"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlabRow {
  from_amount: string;
  to_amount: string;
  commission_pct: string;
}

interface SlabBatch {
  structure_id: string;
  effective_from: string;
  slabs: {
    id: string;
    from_amount: number;
    to_amount: number | null;
    commission_pct: number;
    sort_order: number;
  }[];
}

interface Props {
  userId: string;
  existingBatches: SlabBatch[];
  onSaved?: () => void;
}

const emptyRow = (): SlabRow => ({ from_amount: "", to_amount: "", commission_pct: "" });

export function CommissionSlabEditor({ userId, existingBatches, onSaved }: Props) {
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [rows, setRows] = useState<SlabRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [batches, setBatches] = useState<SlabBatch[]>(existingBatches);

  function addRow() {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, { from_amount: last.to_amount, to_amount: "", commission_pct: "" }]);
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, field: keyof SlabRow, value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    setErrorMsg("");

    const slabs = rows.map((r, i) => ({
      from_amount: parseFloat(r.from_amount) || 0,
      to_amount: r.to_amount ? parseFloat(r.to_amount) : null,
      commission_pct: parseFloat(r.commission_pct) || 0,
      sort_order: i,
    }));

    const res = await fetch("/api/sales/commission/slabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, effective_from: effectiveFrom, slabs }),
    });

    setSaving(false);
    if (res.ok) {
      setStatus("saved");
      setRows([emptyRow()]);
      const refreshed = await fetch(`/api/sales/commission/slabs?user_id=${userId}`);
      if (refreshed.ok) {
        const { data } = await refreshed.json();
        setBatches(data);
      }
      onSaved?.();
    } else {
      const err = await res.json();
      setErrorMsg(JSON.stringify(err.error));
      setStatus("error");
    }
  }

  async function deleteBatch(structureId: string) {
    setDeletingId(structureId);
    await fetch(`/api/sales/commission/slabs/${structureId}`, { method: "DELETE" });
    setBatches(prev => prev.filter(b => b.structure_id !== structureId));
    setDeletingId(null);
  }

  return (
    <div className="space-y-6">
      {/* Existing batches */}
      {batches.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Existing slab structures</p>
          {batches.map(batch => (
            <div key={batch.structure_id} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  Effective from {batch.effective_from.split("T")[0]}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700 h-7 px-2"
                  onClick={() => deleteBatch(batch.structure_id)}
                  disabled={deletingId === batch.structure_id}
                >
                  {deletingId === batch.structure_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <table className="w-full text-xs text-gray-600">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="pb-1">From (₹)</th>
                    <th className="pb-1">To (₹)</th>
                    <th className="pb-1">Commission %</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.slabs.map((s, i) => (
                    <tr key={i}>
                      <td>{s.from_amount.toLocaleString("en-IN")}</td>
                      <td>{s.to_amount != null ? s.to_amount.toLocaleString("en-IN") : "No cap"}</td>
                      <td>{s.commission_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* New slab form */}
      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-sm font-medium text-gray-700">Add new slab structure</p>

        <div>
          <Label htmlFor="effective_from" className="text-xs">Effective from</Label>
          <Input
            id="effective_from"
            type="date"
            value={effectiveFrom}
            onChange={e => setEffectiveFrom(e.target.value)}
            className="mt-1 w-40 text-sm"
          />
        </div>

        <div>
          <div className="grid grid-cols-3 gap-2 mb-1">
            <span className="text-xs text-gray-500">From amount (₹)</span>
            <span className="text-xs text-gray-500">To amount (₹, blank = no cap)</span>
            <span className="text-xs text-gray-500">Commission %</span>
          </div>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 mb-2 items-center">
              <Input
                type="number"
                placeholder="0"
                value={row.from_amount}
                onChange={e => updateRow(i, "from_amount", e.target.value)}
                className="text-sm"
              />
              <Input
                type="number"
                placeholder="No cap"
                value={row.to_amount}
                onChange={e => updateRow(i, "to_amount", e.target.value)}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="0"
                  value={row.commission_pct}
                  onChange={e => updateRow(i, "commission_pct", e.target.value)}
                  className="text-sm"
                />
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-red-400 hover:text-red-600 shrink-0"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow} className="mt-1">
            <Plus className="h-3 w-3 mr-1" /> Add slab
          </Button>
        </div>

        {status === "error" && (
          <p className="text-xs text-red-600">{errorMsg || "Failed to save"}</p>
        )}
        {status === "saved" && (
          <p className="text-xs text-emerald-600">Saved successfully</p>
        )}

        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save structure
        </Button>
      </div>
    </div>
  );
}
