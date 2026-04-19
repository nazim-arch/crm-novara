export type CommissionStatus = "Above Target" | "On Track" | "Below Target" | "No Target";

export function calcAchievementPct(
  closedRevenue: number,
  targetAmount: number | null
): number | null {
  if (!targetAmount || targetAmount === 0) return null;
  return (closedRevenue / targetAmount) * 100;
}

export function commissionStatus(achievementPct: number | null): CommissionStatus {
  if (achievementPct == null) return "No Target";
  if (achievementPct >= 100) return "Above Target";
  if (achievementPct >= 80) return "On Track";
  return "Below Target";
}
