"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CalendarRange, ChevronDown } from "lucide-react";
import type { DashboardRange } from "@/lib/date-range";

const PRESETS: { label: string; value: DashboardRange }[] = [
  { label: "This Month", value: "current_month" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last Month", value: "last_month" },
  { label: "YTD", value: "ytd" },
  { label: "Custom", value: "custom" },
];

interface DashboardFiltersProps {
  currentRange: DashboardRange;
  currentFrom?: string;
  currentTo?: string;
  rangeLabel: string;
}

export function DashboardFilters({ currentRange, currentFrom, currentTo, rangeLabel }: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showCustom, setShowCustom] = useState(currentRange === "custom");
  const [from, setFrom] = useState(currentFrom ?? "");
  const [to, setTo] = useState(currentTo ?? "");

  useEffect(() => {
    setShowCustom(currentRange === "custom");
  }, [currentRange]);

  function applyPreset(range: DashboardRange) {
    if (range === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    params.delete("from");
    params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustom() {
    if (!from || !to || from > to) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4" />
          <span className="font-medium text-foreground">{rangeLabel}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => applyPreset(p.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                currentRange === p.value && p.value !== "custom"
                  ? "bg-violet-600 text-white border-violet-600"
                  : p.value === "custom" && showCustom
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-background text-muted-foreground border-border hover:border-violet-300 hover:text-foreground"
              )}
            >
              {p.label}
              {p.value === "custom" && <ChevronDown className={cn("inline h-3 w-3 ml-1 transition-transform", showCustom && "rotate-180")} />}
            </button>
          ))}
        </div>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-6 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
            <Input type="date" className="h-7 text-xs w-36" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
            <Input type="date" className="h-7 text-xs w-36" value={to} onChange={e => setTo(e.target.value)} min={from} />
          </div>
          <Button
            size="sm"
            className="h-7 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white"
            onClick={applyCustom}
            disabled={!from || !to || from > to}
          >
            Apply
          </Button>
          {from && to && from > to && (
            <p className="text-xs text-destructive">End date must be after start date</p>
          )}
        </div>
      )}
    </div>
  );
}
