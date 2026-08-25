"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Temperature colors — kept in sync with CrmDashboardClient.tsx TEMP_COLOR
const TEMP_COLOR: Record<string, string> = {
  Hot: "#ef4444",
  Warm: "#f97316",
  Cold: "#3b82f6",
  FollowUpLater: "#a855f7",
};

export type PipelineLead = {
  id: string;
  full_name: string;
  lead_number: string;
  temperature: string;
  potential_lead_value: number | null;
  next_followup_date: string | null;
  dueRank: number; // 0 overdue, 1 due today, 2 upcoming, 3 none
  assigned_to_name: string;
};

export type PipelineColumn = {
  stage: string;
  label: string;
  count: number;
  totalValue: number;
  leads: PipelineLead[];
};

// Day-based due label (getDueLabel in focus-queue-theme.ts is minute-of-day oriented and
// doesn't handle a null follow-up date, so we compute a simpler day-scale label here).
function dueLabel(lead: PipelineLead): { text: string; cls: string } {
  if (lead.dueRank === 3 || !lead.next_followup_date) {
    return { text: "No follow-up", cls: "text-muted-foreground" };
  }
  if (lead.dueRank === 1) {
    return { text: "Due today", cls: "text-orange-600 font-semibold" };
  }
  const now = new Date();
  const target = new Date(lead.next_followup_date);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays < 0) {
    const d = Math.abs(diffDays);
    return { text: `Overdue ${d}d`, cls: "text-destructive font-bold" };
  }
  return { text: `In ${diffDays}d`, cls: "text-muted-foreground" };
}

function LeadCard({ lead }: { lead: PipelineLead }) {
  const due = dueLabel(lead);
  const tempColor = TEMP_COLOR[lead.temperature] ?? "#94a3b8";
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="block bg-card border rounded-lg p-3 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm leading-snug truncate">{lead.full_name}</p>
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: tempColor }}
          title={lead.temperature}
        />
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground font-mono">{lead.lead_number}</span>
        {lead.potential_lead_value != null && (
          <span className="text-xs font-medium">{formatCurrency(lead.potential_lead_value)}</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className={cn("text-xs", due.cls)}>{due.text}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[110px]">
          {lead.assigned_to_name}
        </span>
      </div>
    </Link>
  );
}

export function PipelineBoard({ columns }: { columns: PipelineColumn[] }) {
  if (columns.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No stages selected"
        description="Enable at least one stage to see leads."
      />
    );
  }

  const totalLeads = columns.reduce((sum, c) => sum + c.count, 0);
  if (totalLeads === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No leads to focus on"
        description="No leads match the current filters. Try widening the timeline or clearing the temperature/opportunity filters."
      />
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.stage} className="flex-1 min-w-[280px]">
          {/* Column header */}
          <div className="flex items-center justify-between mb-3 px-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{col.label}</span>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {col.count}
              </span>
            </div>
            {col.totalValue > 0 && (
              <span className="text-xs text-muted-foreground">{formatCurrency(col.totalValue)}</span>
            )}
          </div>

          {/* Cards */}
          <div className="space-y-2 min-h-32 max-h-[70vh] overflow-y-auto pr-0.5">
            {col.leads.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No leads</p>
            ) : (
              col.leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
