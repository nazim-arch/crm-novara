"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";

interface Target {
  id: string;
  user_id: string;
  year: number;
  month: number;
  target_amount: number;
}

interface User {
  id: string;
  name: string;
  short_name: string;
}

interface Props {
  salesUsers: User[];
  existingTargets: Target[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function MonthlyTargetManager({ salesUsers, existingTargets }: Props) {
  const now = new Date();
  const [selectedUser, setSelectedUser] = useState(salesUsers[0]?.id ?? "");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [targets, setTargets] = useState<Target[]>(existingTargets);

  const existing = targets.find(
    t => t.user_id === selectedUser && t.year === year && t.month === month
  );

  async function handleSave() {
    if (!selectedUser || !amount) return;
    setSaving(true);
    setStatus("idle");

    const res = await fetch("/api/sales/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: selectedUser,
        year,
        month,
        target_amount: parseFloat(amount),
      }),
    });

    setSaving(false);
    if (res.ok) {
      const { data } = await res.json();
      setTargets(prev => {
        const filtered = prev.filter(
          t => !(t.user_id === selectedUser && t.year === year && t.month === month)
        );
        return [...filtered, { ...data, target_amount: Number(data.target_amount) }];
      });
      setStatus("saved");
      setAmount("");
    } else {
      setStatus("error");
    }
  }

  const userTargets = targets
    .filter(t => t.user_id === selectedUser && t.year === year)
    .sort((a, b) => a.month - b.month);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Sales User</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
          >
            {salesUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Year</Label>
          <Input
            type="number"
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10))}
            className="mt-1 text-sm"
            min={2020}
            max={2100}
          />
        </div>
        <div>
          <Label className="text-xs">Month</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={month}
            onChange={e => setMonth(parseInt(e.target.value, 10))}
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Target (₹)</Label>
          <Input
            type="number"
            placeholder={existing ? existing.target_amount.toLocaleString("en-IN") : "Enter amount"}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
      </div>

      {existing && !amount && (
        <p className="text-xs text-gray-500">
          Current target: ₹{existing.target_amount.toLocaleString("en-IN")}
        </p>
      )}

      {status === "saved" && <p className="text-xs text-emerald-600">Target saved</p>}
      {status === "error" && <p className="text-xs text-red-600">Failed to save</p>}

      <Button onClick={handleSave} disabled={saving || !amount} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save target
      </Button>

      {/* Year summary for selected user */}
      {userTargets.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">{year} targets</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {MONTHS.map((m, i) => {
              const t = userTargets.find(x => x.month === i + 1);
              return (
                <div
                  key={i}
                  className="rounded border p-2 text-center cursor-pointer hover:bg-gray-50"
                  onClick={() => setMonth(i + 1)}
                >
                  <div className="text-xs text-gray-500">{m}</div>
                  <div className="text-xs font-medium mt-0.5">
                    {t ? `₹${(t.target_amount / 100000).toFixed(1)}L` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
