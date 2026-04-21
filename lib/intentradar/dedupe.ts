// lib/intentradar/dedupe.ts
// Probabilistic duplicate-intent detection for IntentRadar leads.
//
// IMPORTANT design principle: we NEVER claim two records are "the same buyer"
// unless there is a hard identity anchor (same handle + platform). Instead we
// use safe, honest language:
//   exact_duplicate    — same handle, platform, near-identical content
//   probable_duplicate — strong multi-dimension match (score ≥ 75)
//   possible_cluster   — moderate match, likely same intent cluster (score 50-74)
//   distinct           — insufficient evidence to cluster (score < 50)
//
// Clustering is additive: once a clusterId is assigned it can grow. We never
// auto-merge records — we only label and annotate them.

export type DedupeDecision =
  | 'distinct'
  | 'possible_cluster'
  | 'probable_duplicate'
  | 'exact_duplicate';

export interface DedupeResult {
  dedupeDecision: DedupeDecision;
  duplicateProbability: number;  // 0-1
  clusterId: string | null;      // ID of the primary lead this clusters with
  matchReasons: string[];
}

interface LeadForDedupe {
  id: string;
  profileHandle: string | null;
  sourcePlatform: string;
  sourceContent: string;
  inferredBudget: string | null;
  inferredLocation: string | null;
  isNRI: boolean;
  leadOriginType: string;
  clusterId: string | null;
}

// ─── Text similarity ───

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );
}

// Jaccard similarity on token sets: |A ∩ B| / |A ∪ B|
function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  for (const t of ta) { if (tb.has(t)) intersection++; }

  const union = ta.size + tb.size - intersection;
  return intersection / union;
}

// ─── Budget band comparison ───

function budgetBandMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  // Extract first number from "2.5 Cr" / "2-3 Cr" style strings
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (isNaN(numA) || isNaN(numB)) return false;
  // Within 1 Cr considered same band
  return Math.abs(numA - numB) <= 1.0;
}

// ─── Main comparison ───

function scorePair(a: LeadForDedupe, b: LeadForDedupe): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Hard identity anchor — same handle + platform
  if (
    a.profileHandle &&
    b.profileHandle &&
    a.profileHandle.toLowerCase() === b.profileHandle.toLowerCase() &&
    a.sourcePlatform === b.sourcePlatform
  ) {
    score += 50;
    reasons.push('Same profile handle and platform');
  }

  // Content similarity
  const textSim = jaccardSimilarity(a.sourceContent, b.sourceContent);
  if (textSim >= 0.7) {
    score += 25;
    reasons.push(`Near-identical content (${Math.round(textSim * 100)}% overlap)`);
  } else if (textSim >= 0.4) {
    score += 12;
    reasons.push(`Similar content (${Math.round(textSim * 100)}% overlap)`);
  }

  // Same inferred location
  if (
    a.inferredLocation &&
    b.inferredLocation &&
    a.inferredLocation.toLowerCase() === b.inferredLocation.toLowerCase()
  ) {
    score += 10;
    reasons.push('Same inferred location');
  }

  // Same budget band
  if (budgetBandMatch(a.inferredBudget, b.inferredBudget)) {
    score += 10;
    reasons.push('Matching budget band');
  }

  // Both NRI
  if (a.isNRI && b.isNRI) {
    score += 5;
    reasons.push('Both NRI buyers');
  }

  // Cross-platform signals from same apparent intent (different platform, high text sim)
  if (a.sourcePlatform !== b.sourcePlatform && textSim >= 0.4) {
    score += 5;
    reasons.push('Cross-platform intent match');
  }

  return { score: Math.min(score, 100), reasons };
}

function decisionFromScore(score: number, hasIdentityAnchor: boolean): DedupeDecision {
  if (score >= 90 && hasIdentityAnchor) return 'exact_duplicate';
  if (score >= 75) return 'probable_duplicate';
  if (score >= 50) return 'possible_cluster';
  return 'distinct';
}

// ─── Public API ───

/**
 * Runs probabilistic deduplication over a batch of leads.
 * Each lead is compared against all earlier leads in the batch.
 * Returns a map of leadId → DedupeResult.
 *
 * Leads from the same origin (real vs synthetic) are compared separately —
 * synthetic leads never cluster with real leads.
 */
export function deduplicateBatch(leads: LeadForDedupe[]): Map<string, DedupeResult> {
  const results = new Map<string, DedupeResult>();
  // Track cluster assignments: leadId → clusterId
  const clusterMap = new Map<string, string>();

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    let bestScore = 0;
    let bestMatch: LeadForDedupe | null = null;
    let bestReasons: string[] = [];

    for (let j = 0; j < i; j++) {
      const candidate = leads[j];

      // Never cluster synthetic with real leads — hard trust boundary
      if (lead.leadOriginType !== candidate.leadOriginType) continue;

      const { score, reasons } = scorePair(lead, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
        bestReasons = reasons;
      }
    }

    const hasIdentityAnchor = bestReasons.some(r => r.includes('Same profile handle'));
    const decision = bestMatch
      ? decisionFromScore(bestScore, hasIdentityAnchor)
      : 'distinct';

    let clusterId: string | null = null;
    if (bestMatch && decision !== 'distinct') {
      // Inherit or create cluster from primary
      clusterId = clusterMap.get(bestMatch.id) ?? bestMatch.id;
      clusterMap.set(lead.id, clusterId);
    }

    results.set(lead.id, {
      dedupeDecision: decision,
      duplicateProbability: bestScore / 100,
      clusterId,
      matchReasons: bestReasons,
    });
  }

  return results;
}
