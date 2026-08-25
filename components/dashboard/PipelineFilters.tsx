"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type PipelineOpportunity = { id: string; name: string; opp_number: string };

interface PipelineFiltersProps {
  opportunities: PipelineOpportunity[];
  currentOpportunityId?: string;
  currentTemperature?: string;
  /** Stages currently hidden (removed columns). */
  hidden: string[];
  /** All toggleable stages, in order, with display labels. */
  stages: { stage: string; label: string }[];
}

export function PipelineFilters({
  opportunities,
  currentOpportunityId,
  currentTemperature,
  hidden,
  stages,
}: PipelineFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleStage(stage: string) {
    const next = new Set(hidden);
    if (next.has(stage)) next.delete(stage);
    else next.add(stage);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size > 0) params.set("hidden", Array.from(next).join(","));
    else params.delete("hidden");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Temperature */}
        <div className="flex flex-col gap-1 w-full sm:w-36">
          <span className="text-[11px] font-medium text-muted-foreground">Temperature</span>
          <Select
            value={currentTemperature ?? "all"}
            onValueChange={(v) => setParam("temperature", v ?? "all")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Temperature" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All temps</SelectItem>
              <SelectItem value="Hot">🔥 Hot</SelectItem>
              <SelectItem value="Warm">☀️ Warm</SelectItem>
              <SelectItem value="Cold">❄️ Cold</SelectItem>
              <SelectItem value="FollowUpLater">Later</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Opportunity */}
        <div className="flex flex-col gap-1 w-full sm:w-64">
          <span className="text-[11px] font-medium text-muted-foreground">Opportunity</span>
          <Select
            value={currentOpportunityId ?? "all"}
            onValueChange={(v) => setParam("opportunity_id", v ?? "all")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Opportunity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All opportunities</SelectItem>
              {opportunities.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stage visibility toggle */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Stages</span>
        <div className="flex flex-wrap gap-1.5">
          {stages.map((s) => {
            const isVisible = !hidden.includes(s.stage);
            return (
              <button
                key={s.stage}
                onClick={() => toggleStage(s.stage)}
                aria-pressed={isVisible}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  isVisible
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-background text-muted-foreground border-border line-through hover:border-violet-300 hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
