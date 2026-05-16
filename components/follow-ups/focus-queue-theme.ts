export type FocusQueueTheme = {
  name: string;
  card: string;
  border: string;
  strip: string;
  badgeBg: string;
  badgeText: string;
  priorityLabel: string;
  headline: string;
  urgencyBadges: Array<{ text: string; cls: string }>;
};

export function getFollowUpCardTheme(
  temperature: string | null | undefined,
  isOverdue: boolean,
  daysOverdue: number,
  noResponseCount: number,
  potentialValue: number | null,
  hasCallbackToday: boolean,
): FocusQueueTheme {
  const base = getBaseTheme(temperature);
  const badges: Array<{ text: string; cls: string }> = [];

  if (hasCallbackToday)
    badges.push({ text: "Callback Today", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" });
  if (daysOverdue > 2)
    badges.push({ text: `${daysOverdue}d Overdue`, cls: "bg-red-200 text-red-800 font-semibold dark:bg-red-900/60 dark:text-red-200" });
  else if (isOverdue)
    badges.push({ text: "Overdue", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" });
  if (noResponseCount >= 3)
    badges.push({ text: `No Response ×${noResponseCount}`, cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" });
  if (potentialValue && potentialValue >= 5_000_000)
    badges.push({ text: "High Value", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200" });
  if (temperature === "Hot" && daysOverdue > 0)
    badges.push({ text: "Immediate Action Required", cls: "bg-red-200 text-red-900 font-bold dark:bg-red-900/70 dark:text-red-100" });
  if (temperature === "Hot" && !isOverdue && !hasCallbackToday)
    badges.push({ text: "Call Now", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" });

  return { ...base, urgencyBadges: badges };
}

function getBaseTheme(temp: string | null | undefined): Omit<FocusQueueTheme, "urgencyBadges"> {
  switch (temp) {
    case "Hot":
      return {
        name: "hot",
        card: "bg-gradient-to-b from-red-50 to-orange-50/60 dark:from-red-950/30 dark:to-orange-950/20",
        border: "border-red-300 dark:border-red-700",
        strip: "bg-gradient-to-r from-red-500 via-orange-400 to-red-500",
        badgeBg: "bg-red-100 dark:bg-red-900/40",
        badgeText: "text-red-700 dark:text-red-300",
        priorityLabel: "HIGH PRIORITY · HOT LEAD",
        headline: "Prioritize this lead. Do not let it leak.",
      };
    case "Warm":
      return {
        name: "warm",
        card: "bg-gradient-to-b from-amber-50 to-yellow-50/40 dark:from-amber-950/25 dark:to-yellow-950/15",
        border: "border-amber-300 dark:border-amber-700",
        strip: "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400",
        badgeBg: "bg-amber-100 dark:bg-amber-900/40",
        badgeText: "text-amber-700 dark:text-amber-300",
        priorityLabel: "NURTURE · WARM LEAD",
        headline: "Keep the momentum alive.",
      };
    case "Cold":
      return {
        name: "cold",
        card: "bg-gradient-to-b from-slate-50 to-blue-50/30 dark:from-slate-900/30 dark:to-blue-950/15",
        border: "border-slate-300 dark:border-slate-600",
        strip: "bg-gradient-to-r from-slate-400 via-blue-400 to-slate-400",
        badgeBg: "bg-slate-100 dark:bg-slate-800/60",
        badgeText: "text-slate-600 dark:text-slate-300",
        priorityLabel: "REACTIVATION · COLD LEAD",
        headline: "Try to revive, qualify, or close cleanly.",
      };
    case "FollowUpLater":
      return {
        name: "later",
        card: "bg-gradient-to-b from-purple-50 to-indigo-50/30 dark:from-purple-950/25 dark:to-indigo-950/15",
        border: "border-purple-200 dark:border-purple-700",
        strip: "bg-gradient-to-r from-purple-400 via-indigo-400 to-purple-400",
        badgeBg: "bg-purple-100 dark:bg-purple-900/40",
        badgeText: "text-purple-700 dark:text-purple-300",
        priorityLabel: "LONG-TERM NURTURE",
        headline: "Check in and re-qualify.",
      };
    default:
      return {
        name: "neutral",
        card: "bg-card",
        border: "border-border",
        strip: "bg-muted",
        badgeBg: "bg-muted",
        badgeText: "text-muted-foreground",
        priorityLabel: "FOLLOW-UP",
        headline: "Action this lead.",
      };
  }
}

export function getDueLabel(
  scheduledAt: Date | string,
  callbackAt: Date | string | null,
): { label: string; cls: string; isUrgent: boolean } {
  const target = callbackAt ? new Date(callbackAt) : new Date(scheduledAt);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (callbackAt) {
    if (diffMins <= 0) return { label: "Callback now", cls: "text-violet-700 font-bold", isUrgent: true };
    if (diffMins < 60) return { label: `Callback in ${diffMins}m`, cls: "text-violet-600 font-medium", isUrgent: false };
    return {
      label: `Callback at ${new Date(callbackAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
      cls: "text-violet-600", isUrgent: false,
    };
  }

  const diffDays = Math.floor(-diffMs / 86_400_000);
  if (diffMs < 0 && diffDays >= 1) return { label: `Overdue by ${diffDays}d`, cls: "text-destructive font-bold", isUrgent: true };
  if (diffMs < 0) return { label: "Overdue", cls: "text-destructive font-bold", isUrgent: true };
  if (diffMins < 30) return { label: "Due now", cls: "text-orange-600 font-bold", isUrgent: true };
  if (diffMins < 120) return { label: `Due in ${diffMins}m`, cls: "text-orange-500 font-semibold", isUrgent: false };
  return {
    label: `Due at ${target.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
    cls: "text-muted-foreground",
    isUrgent: false,
  };
}
