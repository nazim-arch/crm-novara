export type LeadTemperature = "Hot" | "Warm" | "Cold" | "FollowUpLater";

export type ReviewTheme = {
  card: string;
  badge: string;
  dot: string;
  label: string;
  border: string;
};

export function getLeadReviewTheme(temperature: string | null | undefined): ReviewTheme {
  switch (temperature) {
    case "Hot":
      return {
        card: "bg-red-50/70 dark:bg-red-950/20",
        badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
        dot: "bg-red-500",
        border: "border-red-200 dark:border-red-800",
        label: "Hot",
      };
    case "Warm":
      return {
        card: "bg-amber-50/70 dark:bg-amber-950/20",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        dot: "bg-amber-400",
        border: "border-amber-200 dark:border-amber-800",
        label: "Warm",
      };
    case "Cold":
      return {
        card: "bg-blue-50/50 dark:bg-blue-950/20",
        badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        dot: "bg-blue-400",
        border: "border-blue-200 dark:border-blue-800",
        label: "Cold",
      };
    case "FollowUpLater":
      return {
        card: "bg-purple-50/50 dark:bg-purple-950/20",
        badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
        dot: "bg-purple-400",
        border: "border-purple-200 dark:border-purple-800",
        label: "Follow Up Later",
      };
    default:
      return {
        card: "bg-muted/30",
        badge: "bg-muted text-muted-foreground",
        dot: "bg-muted-foreground",
        border: "border-border",
        label: temperature ?? "Unknown",
      };
  }
}

export function getTriggerLabel(triggerType: string): string {
  switch (triggerType) {
    case "StageChange":        return "Stage Changed";
    case "FollowUpAdded":      return "Follow-up Scheduled";
    case "TemperatureChanged": return "Temperature Changed";
    case "AssigneeChanged":    return "Reassigned";
    case "NoteAdded":          return "Note Added";
    case "FieldUpdated":       return "Fields Updated";
    default:                   return triggerType;
  }
}

// Returns structured change details for the report card
export function getTriggerDetails(
  triggerType: string,
  ctx: Record<string, unknown>
): { headline: string; sub: string | null; notes: string | null } {
  const notes = ctx.notes ? String(ctx.notes) : null;

  switch (triggerType) {
    case "StageChange": {
      // Live events use from_status/to_stage; backfill uses from_stage/to_stage
      const from = String(ctx.from_status ?? ctx.from_stage ?? "");
      const to = String(ctx.to_stage ?? "");
      const activity = ctx.activity_stage ? String(ctx.activity_stage) : null;

      let headline = "Stage updated";
      if (from && to && from !== to) headline = `${from} → ${to}`;
      else if (to) headline = `Set to ${to}`;

      const sub = activity ? `Activity stage: ${activity}` : null;
      return { headline, sub, notes };
    }
    case "TemperatureChanged": {
      const from = ctx.from_temp ?? ctx.from ?? "?";
      const to = ctx.to_temp ?? ctx.to ?? "?";
      return { headline: `${from} → ${to}`, sub: null, notes };
    }
    case "FollowUpAdded": {
      const type = ctx.followup_type ?? ctx.type ?? "Follow-up";
      const at = ctx.scheduled_at
        ? new Date(ctx.scheduled_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        : null;
      return {
        headline: `${type}${at ? ` on ${at}` : ""}`,
        sub: ctx.priority ? `Priority: ${ctx.priority}` : null,
        notes,
      };
    }
    case "AssigneeChanged":
      return { headline: `${ctx.from_name ?? "?"} → ${ctx.to_name ?? "?"}`, sub: null, notes };
    case "NoteAdded":
      return { headline: "Note added", sub: null, notes: ctx.note_preview ? String(ctx.note_preview).slice(0, 120) : notes };
    default:
      return { headline: "Activity recorded", sub: null, notes };
  }
}

// Keep for legacy compatibility
export function getTriggerDescription(triggerType: string, ctx: Record<string, unknown>): string {
  const d = getTriggerDetails(triggerType, ctx);
  return d.headline + (d.sub ? ` · ${d.sub}` : "");
}
