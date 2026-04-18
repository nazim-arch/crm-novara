"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Rate = {
  id: string;
  seater_type: string;
  recording_rate_per_hour: number;
  editing_rate_per_hour: number;
};

const SEATER_ICONS: Record<string, string> = {
  "1-Seater": "🎙️",
  "2-Seater": "🎙️🎙️",
  "3-Seater": "🎙️🎙️🎙️",
  "4-Seater": "🎙️🎙️🎙️🎙️",
};

const SEATER_DESC: Record<string, string> = {
  "1-Seater": "Solo podcast / solo interview",
  "2-Seater": "Two-person show / co-host",
  "3-Seater": "Panel of 3 / interview format",
  "4-Seater": "Full panel / group discussion",
};

export function StudioRatesSettings({ initialRates }: { initialRates: Rate[] }) {
  const [rates, setRates] = useState<Rate[]>(
    // Ensure consistent order
    ["1-Seater", "2-Seater", "3-Seater", "4-Seater"].map(s =>
      initialRates.find(r => r.seater_type === s) ?? {
        id: "", seater_type: s, recording_rate_per_hour: 0, editing_rate_per_hour: 0,
      }
    )
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  function updateRate(seater: string, field: "recording_rate_per_hour" | "editing_rate_per_hour", value: number) {
    setRates(prev => prev.map(r => r.seater_type === seater ? { ...r, [field]: value } : r));
    setStatus("idle");
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/podcast-studio/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: rates.map(r => ({
          seater_type: r.seater_type,
          recording_rate_per_hour: r.recording_rate_per_hour,
          editing_rate_per_hour: r.editing_rate_per_hour,
        })) }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function exampleRevenue(rate: Rate) {
    const rec2h = rate.recording_rate_per_hour * 2;
    const edit1h = rate.editing_rate_per_hour * 1;
    const base = rec2h + edit1h;
    const gst = base * 0.18;
    return base + gst;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">How rates work</p>
          <p className="mt-0.5 text-blue-700">When creating a booking, selecting a seater type and entering hours will auto-suggest the recording and editing values based on these rates. The user can always override the suggested amount.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rates.map(rate => (
          <div key={rate.seater_type} className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{SEATER_ICONS[rate.seater_type]}</span>
                  <h3 className="font-semibold">{rate.seater_type}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{SEATER_DESC[rate.seater_type]}</p>
              </div>
              {exampleRevenue(rate) > 0 && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">2 hr rec + 1 hr edit</p>
                  <p className="text-sm font-semibold text-violet-700">
                    ₹{exampleRevenue(rate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">incl. 18% GST</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Recording Rate / hr (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="50"
                  value={rate.recording_rate_per_hour || ""}
                  placeholder="0"
                  onChange={e => updateRate(rate.seater_type, "recording_rate_per_hour", Number(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Editing Rate / hr (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="50"
                  value={rate.editing_rate_per_hour || ""}
                  placeholder="0"
                  onChange={e => updateRate(rate.seater_type, "editing_rate_per_hour", Number(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {(rate.recording_rate_per_hour > 0 || rate.editing_rate_per_hour > 0) && (
              <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground grid grid-cols-2 gap-1">
                <span>Recording/hr:</span>
                <span className="font-medium text-foreground text-right">₹{rate.recording_rate_per_hour.toLocaleString("en-IN")}</span>
                <span>Editing/hr:</span>
                <span className="font-medium text-foreground text-right">₹{rate.editing_rate_per_hour.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Rates
        </Button>

        {status === "saved" && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Rates saved successfully
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Failed to save. Please try again.
          </div>
        )}
      </div>

      {/* Rate summary table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30">
          <p className="text-sm font-semibold">Rate Summary</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Seater</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Recording / hr</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Editing / hr</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">1 hr session (rec only + 18% GST)</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r, i) => {
              const base = r.recording_rate_per_hour;
              const total = base + base * 0.18;
              return (
                <tr key={r.seater_type} className={cn("border-b last:border-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                  <td className="px-5 py-3 font-medium">{r.seater_type}</td>
                  <td className="px-5 py-3 text-right">
                    {r.recording_rate_per_hour > 0 ? `₹${r.recording_rate_per_hour.toLocaleString("en-IN")}` : <span className="text-muted-foreground">Not set</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.editing_rate_per_hour > 0 ? `₹${r.editing_rate_per_hour.toLocaleString("en-IN")}` : <span className="text-muted-foreground">Not set</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-violet-700">
                    {base > 0 ? `₹${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : <span className="text-muted-foreground font-normal">—</span>}
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
