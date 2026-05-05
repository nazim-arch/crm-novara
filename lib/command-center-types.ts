// Shared types for Sales Command Center — no Prisma imports here (safe for client use)

export type ActionSource = "followup" | "lead";
export type ActionSection = "urgent" | "today" | "pipeline" | "upcoming";

export interface ActionLeadRef {
  id: string;
  lead_number: string;
  full_name: string;
  phone: string | null;
  temperature: string;
  status: string;
  potential_lead_value: number | null;
}

export interface ActionOppRef {
  id: string;
  name: string;
}

export interface ActionItem {
  id: string;             // `fu_${id}` | `lead_${id}`
  source: ActionSource;
  sourceId: string;       // actual DB id of the source entity
  actionType: string;     // "Call" | "WhatsApp" | "Meeting" | "Visit" | "Email" | "Internal"
  section: ActionSection;
  priorityScore: number;  // 0–100, higher = more urgent
  overdueDays: number;    // 0 when not overdue
  dueAt: string | null;   // ISO string
  lead: ActionLeadRef | null;
  opportunity: ActionOppRef | null;
  context: string | null; // last note / outcome
  reason: string;         // human label: "Overdue follow-up (2d)", "Hot lead — no action 48h+", …
  assignedToName: string;
  assignedToId: string;
}

export const SECTION_META: Record<ActionSection, { label: string; color: string; bgClass: string; borderClass: string; dotClass: string }> = {
  urgent:   { label: "Urgent",           color: "#ef4444", bgClass: "bg-red-50/60 dark:bg-red-950/20",     borderClass: "border-red-200 dark:border-red-900/40",    dotClass: "bg-red-500"    },
  today:    { label: "Today",            color: "#f59e0b", bgClass: "bg-amber-50/60 dark:bg-amber-950/20", borderClass: "border-amber-200 dark:border-amber-900/40", dotClass: "bg-amber-500"  },
  pipeline: { label: "Pipeline Attention", color: "#3b82f6", bgClass: "bg-blue-50/40 dark:bg-blue-950/20",  borderClass: "border-blue-200 dark:border-blue-900/40",  dotClass: "bg-blue-500"   },
  upcoming: { label: "Upcoming",         color: "#6b7280", bgClass: "bg-muted/40",                         borderClass: "border-border",                            dotClass: "bg-muted-foreground" },
};

export const ACTION_TYPE_ICON: Record<string, string> = {
  Call: "📞", WhatsApp: "💬", Email: "✉️", Visit: "🏠",
  Meeting: "🤝", Activity: "📋", Internal: "🔧",
};

export const TEMP_LABELS: Record<string, { label: string; cls: string }> = {
  Hot:           { label: "🔥 Hot",   cls: "bg-red-100 text-red-700 border-red-200" },
  Warm:          { label: "☀️ Warm",  cls: "bg-orange-100 text-orange-700 border-orange-200" },
  Cold:          { label: "❄️ Cold",  cls: "bg-blue-100 text-blue-700 border-blue-200" },
  FollowUpLater: { label: "🔔 FUL",   cls: "bg-purple-100 text-purple-700 border-purple-200" },
};
