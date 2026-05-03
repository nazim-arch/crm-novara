import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type LeadStatus =
  | "New"
  | "Prospect"
  | "SiteVisitCompleted"
  | "Negotiation"
  | "Won"
  | "Lost"
  | "InvalidLead"
  | "OnHold"
  | "Recycle";

type LeadTemperature = "Hot" | "Warm" | "Cold" | "FollowUpLater";

const STATUS_STYLES: Record<LeadStatus, string> = {
  New: "bg-slate-100 text-slate-700",
  Prospect: "bg-indigo-100 text-indigo-700",
  SiteVisitCompleted: "bg-cyan-100 text-cyan-700",
  Negotiation: "bg-orange-100 text-orange-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  InvalidLead: "bg-rose-100 text-rose-700",
  OnHold: "bg-gray-100 text-gray-600",
  Recycle: "bg-lime-100 text-lime-700",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  New: "New",
  Prospect: "Prospect",
  SiteVisitCompleted: "Site Visit",
  Negotiation: "Negotiation",
  Won: "Won",
  Lost: "Lost",
  InvalidLead: "Invalid Lead",
  OnHold: "On Hold",
  Recycle: "Recycle",
};

const TEMP_STYLES: Record<LeadTemperature, string> = {
  Hot: "bg-red-100 text-red-700",
  Warm: "bg-orange-100 text-orange-700",
  Cold: "bg-blue-100 text-blue-700",
  FollowUpLater: "bg-gray-100 text-gray-600",
};

const TEMP_LABELS: Record<LeadTemperature, string> = {
  Hot: "Hot",
  Warm: "Warm",
  Cold: "Cold",
  FollowUpLater: "Later",
};

export function LeadStatusBadge({ status }: { status: string }) {
  const s = status as LeadStatus;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[s] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {STATUS_LABELS[s] ?? status}
    </span>
  );
}

export function TemperatureBadge({ temperature }: { temperature: string }) {
  const t = temperature as LeadTemperature;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TEMP_STYLES[t] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {TEMP_LABELS[t] ?? temperature}
    </span>
  );
}

export function ActivityStageBadge({ stage }: { stage: string }) {
  const styles: Record<string, string> = {
    New: "bg-slate-100 text-slate-700",
    NoResponse: "bg-yellow-100 text-yellow-700",
    Busy: "bg-amber-100 text-amber-700",
    Unreachable: "bg-orange-100 text-orange-700",
    Prospect: "bg-blue-100 text-blue-700",
    CallBack: "bg-violet-100 text-violet-700",
    NotInterested: "bg-red-100 text-red-700",
    Junk: "bg-rose-100 text-rose-800",
  };
  const labels: Record<string, string> = {
    New: "New",
    NoResponse: "No Response",
    Busy: "Busy",
    Unreachable: "Unreachable",
    Prospect: "Prospect",
    CallBack: "Call Back",
    NotInterested: "Not Interested",
    Junk: "Junk",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        styles[stage] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {labels[stage] ?? stage}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    Low: "bg-slate-100 text-slate-600",
    Medium: "bg-blue-100 text-blue-700",
    High: "bg-orange-100 text-orange-700",
    Critical: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        styles[priority] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {priority}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Todo: "bg-slate-100 text-slate-700",
    InProgress: "bg-blue-100 text-blue-700",
    Done: "bg-green-100 text-green-700",
    Cancelled: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    Todo: "To Do",
    InProgress: "In Progress",
    Done: "Done",
    Cancelled: "Cancelled",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

export { Badge };
