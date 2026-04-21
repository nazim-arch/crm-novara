// lib/intentradar/freshness.ts
// Time-decay freshness scoring for IntentRadar leads.
// freshnessScore: 1.0 = seen today, decays to ~0.1 after 90 days.
// Leads updated by new matching signals have their lastSeenAt refreshed
// which resets freshness, keeping active intent clusters visible.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes a freshness score between 0.1 and 1.0 based on lastSeenAt.
 * Uses exponential decay with a half-life of ~30 days.
 */
export function computeFreshnessScore(lastSeenAt: Date): number {
  const daysSince = (Date.now() - lastSeenAt.getTime()) / DAY_MS;

  if (daysSince <= 0) return 1.0;

  // Exponential decay: score = e^(-k * days), k chosen so 30 days → ~0.5
  const k = Math.LN2 / 30; // ln(2)/30 ≈ 0.0231
  const raw = Math.exp(-k * daysSince);

  // Floor at 0.1 so very old leads remain visible but deprioritised
  return Math.max(0.1, Math.min(1.0, raw));
}

/** Label for UI display */
export function freshnessLabel(score: number): string {
  if (score >= 0.9) return 'Fresh';
  if (score >= 0.6) return 'Recent';
  if (score >= 0.3) return 'Aging';
  return 'Stale';
}

export function freshnessColor(score: number): string {
  if (score >= 0.9) return '#15803d';
  if (score >= 0.6) return '#b45309';
  if (score >= 0.3) return '#ea580c';
  return '#dc2626';
}

/**
 * Composite ranking weight combining intent score, source confidence, and freshness.
 * Used to sort leads: higher is better.
 */
export function computeRankWeight(
  totalScore: number,
  freshnessScore: number,
  dedupeDecision: string | null,
): number {
  // Probable duplicates are downweighted so the primary signal surfaces first
  const dedupePenalty = dedupeDecision === 'probable_duplicate' ? 0.5
    : dedupeDecision === 'possible_cluster' ? 0.8
    : 1.0;

  return totalScore * freshnessScore * dedupePenalty;
}
