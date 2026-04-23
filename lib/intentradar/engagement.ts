// lib/intentradar/engagement.ts
// Engagement gating, comment-level lead extraction, hot cluster detection

export type CommentIntentType = 'strong_buyer' | 'medium_buyer' | 'seller_broker' | 'noise' | 'spam';

export interface CommentLead {
  authorHandle?: string;
  authorName?: string;
  comment: string;
  intentType: CommentIntentType;
  profileUrl?: string;
}

export interface PostEngagement {
  likes: number;
  comments: number;
  shares?: number;
  views?: number;
}

export interface EngagementAnalysis {
  engagementScore: number;       // 0-100
  buyerEngDensity: number;       // 0.0–1.0 (buyer_intent_comments / total_comments)
  isHotCluster: boolean;         // 3+ distinct buyer-intent users
  buyerIntentComments: CommentLead[];
  passesGate: boolean;
}

// Pre-lead gates — source must pass at least one
export const MIN_LIKES    = 5;
export const MIN_COMMENTS = 2;
export const MIN_BUYER_INTENT_COMMENTS = 1; // of those comments, at least 1 must be buyer intent

// ─── INTENT CLASSIFICATION ────────────────────────────────────────────────────

const STRONG_BUYER_PATTERNS = [
  /\binterested\b/i,
  /seriously interested/i,
  /very interested/i,
  /\bkeen\b/i,
  /ready to buy/i,
  /want to (buy|purchase)/i,
  /planning to (buy|purchase)/i,
  /price\s*\??$/im,
  /rate\s*\??$/im,
  /how much/i,
  /what('s| is) the (price|rate|cost)/i,
  /\bpricing\b/i,
  /\bdm me\b/i,
  /\bdm sent\b/i,
  /\bcheck dms?\b/i,
  /\bwhatsapp\b/i,
  /\bcontact (number|no)\b/i,
  /send details/i,
  /share details/i,
  /site visit/i,
  /floor plan/i,
  /\bbrochure\b/i,
  /call me/i,
  /share (your )?number/i,
  /\bpm me\b/i,
  /available\s*\??$/im,
  /is it available/i,
  /still available/i,
  /any units? left/i,
  /budget (match|suits)/i,
  /serious buyer/i,
  /interested buyer/i,
];

const MEDIUM_BUYER_PATTERNS = [
  /nice (project|property|place|location)/i,
  /looks (good|great|nice|amazing)/i,
  /good (location|area|project)/i,
  /where is this/i,
  /which (area|locality|location)/i,
  /more (info|details|information)/i,
  /tell me more/i,
  /want to know more/i,
  /any availability/i,
  /when available/i,
  /when (is |the )?possession/i,
  /looking for similar/i,
  /looking to (buy|purchase)/i,
  /\bwant to buy\b/i,
  /\bplanning\b/i,
  /which builder/i,
  /builder review/i,
  /is this (rera|approved|good investment)/i,
];

const SELLER_BROKER_PATTERNS = [
  /dm for (best|exclusive|lowest) price/i,
  /contact (for|me for) (exclusive|best|site)/i,
  /\bbook now\b/i,
  /limited (units|availability|offer)/i,
  /pre.launch (offer|price)/i,
  /i have (similar|this type of) property/i,
  /i can help you (buy|find)/i,
  /my listings?/i,
  /call for site visit/i,
  /best (rates|price) guaranteed/i,
];

const SPAM_PATTERNS = [
  /follow for follow/i,
  /check my (page|profile|account)/i,
  /visit my (page|profile|bio)/i,
  /click (the )?link in bio/i,
  /🔥{3,}/,
  /limited time offer/i,
];

export function classifyCommentIntent(comment: string): CommentIntentType {
  if (SPAM_PATTERNS.some(re => re.test(comment))) return 'spam';
  if (SELLER_BROKER_PATTERNS.some(re => re.test(comment))) return 'seller_broker';
  if (STRONG_BUYER_PATTERNS.some(re => re.test(comment))) return 'strong_buyer';
  if (MEDIUM_BUYER_PATTERNS.some(re => re.test(comment))) return 'medium_buyer';
  return 'noise';
}

// ─── POST ENGAGEMENT SCORE ────────────────────────────────────────────────────

export function computeEngagementScore(eng: PostEngagement): number {
  const { likes, comments, shares = 0, views = 0 } = eng;
  let score = 0;
  score += Math.min(likes * 2, 40);                                     // max 40 pts
  score += Math.min(comments * 5, 35);                                  // max 35 pts
  score += Math.min(shares * 3, 15);                                    // max 15 pts
  score += views > 0 ? Math.min(Math.log10(views + 1) * 5, 10) : 0;    // max 10 pts
  return Math.round(Math.min(score, 100));
}

// ─── BUYER ENGAGEMENT DENSITY ─────────────────────────────────────────────────

export function computeBuyerEngagementDensity(buyerCount: number, totalComments: number): number {
  if (totalComments === 0) return 0;
  return Math.round((buyerCount / totalComments) * 100) / 100;
}

// ─── GATE CHECK ───────────────────────────────────────────────────────────────

export function gatePost(eng: PostEngagement): boolean {
  return eng.likes >= MIN_LIKES || eng.comments >= MIN_COMMENTS;
}

// ─── FULL ANALYSIS ───────────────────────────────────────────────────────────

export function analyzePostEngagement(
  eng: PostEngagement,
  comments: Array<{ authorHandle?: string; authorName?: string; text: string; profileUrl?: string }>
): EngagementAnalysis {
  const engagementScore = computeEngagementScore(eng);

  if (!gatePost(eng)) {
    return { engagementScore, buyerEngDensity: 0, isHotCluster: false, buyerIntentComments: [], passesGate: false };
  }

  const buyerIntentComments: CommentLead[] = [];
  const distinctBuyerKeys = new Set<string>();

  for (const c of comments) {
    const intentType = classifyCommentIntent(c.text);
    if (intentType === 'strong_buyer' || intentType === 'medium_buyer') {
      buyerIntentComments.push({ authorHandle: c.authorHandle, authorName: c.authorName, comment: c.text, intentType, profileUrl: c.profileUrl });
      distinctBuyerKeys.add(c.authorHandle || c.authorName || c.text.slice(0, 40));
    }
  }

  const passesGate = buyerIntentComments.length >= MIN_BUYER_INTENT_COMMENTS;

  return {
    engagementScore,
    buyerEngDensity: computeBuyerEngagementDensity(buyerIntentComments.length, comments.length),
    isHotCluster: distinctBuyerKeys.size >= 3,
    buyerIntentComments,
    passesGate,
  };
}
