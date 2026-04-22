// lib/intentradar/seller-scoring.ts
// Scoring engine for SELLER mode leads

import { RawSignal } from './scrapers';
import { ScoredLead } from './scoring';
import { classifySellerType, extractListingPrice } from './modes/seller';

interface SellerCriteria {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
}

// ─── SELLER SCORING DIMENSIONS ────────────────────────────────────────────────

function scorePriceClarity(content: string, criteria: SellerCriteria): number {
  let score = 0;
  const lower = content.toLowerCase();

  const price = extractListingPrice(content);
  if (price) score += 10;

  // Price range given (more specific)
  if (/(\d+\.?\d*)\s*(?:to|-)\s*(\d+\.?\d*)\s*(cr|crore)/i.test(content)) score += 3;

  // Budget vs criteria
  const crMatch = content.match(/(\d+\.?\d*)\s*(cr|crore)/i);
  if (crMatch && price) {
    const listed = parseFloat(crMatch[1]);
    if (listed >= criteria.budgetMin && listed <= criteria.budgetMax) score += 4;
  }

  // "Negotiable" or "best price"
  if (/negotiable|best price|price on request|call for price|contact for price/i.test(content)) score += 2;

  return Math.min(score, 15);
}

function scorePropertyDetail(content: string, criteria: SellerCriteria): number {
  let score = 0;

  // BHK mentioned
  if (/\d\s*bhk/i.test(content)) score += 4;
  if (criteria.bhkConfig && new RegExp(criteria.bhkConfig, 'i').test(content)) score += 3;

  // Square footage
  if (/\d+\s*(sqft|sq\.?\s*ft|square\s*feet)/i.test(content)) score += 4;

  // Property type match
  if (content.toLowerCase().includes(criteria.propertyType.toLowerCase())) score += 3;

  // RERA
  if (/rera/i.test(content)) score += 3;

  // Carpet/built-up area
  if (/carpet area|builtup|built-up|super built/i.test(content)) score += 2;

  // Floor/facing
  if (/floor|facing|east|north|vastu/i.test(content)) score += 1;

  return Math.min(score, 12);
}

function scoreSellerUrgency(content: string): number {
  let score = 0;

  if (/urgent sale|distress sale|must sell|selling urgently|immediate sale/i.test(content)) score += 10;
  else if (/quick sale|fast sale|motivated seller|price reduced|reduced price/i.test(content)) score += 7;
  else if (/ready to move|possession ready|oc received|immediate possession/i.test(content)) score += 5;
  else if (/under construction|possession in|possession by/i.test(content)) score += 3;

  return Math.min(score, 12);
}

function scoreLocationClarity(content: string, criteria: SellerCriteria): number {
  let score = 0;
  const lower = content.toLowerCase();

  // City match
  if (lower.includes(criteria.city.toLowerCase())) score += 3;

  // Micro-market match
  let marketsMatched = 0;
  for (const market of criteria.microMarkets) {
    if (lower.includes(market.toLowerCase())) marketsMatched++;
  }
  if (marketsMatched === 1) score += 8; // specific location
  else if (marketsMatched === 2) score += 5;
  else if (marketsMatched > 2) score += 3;

  // Road/layout/sector
  if (/main road|cross|layout|stage|phase|sector|block|near/i.test(content)) score += 2;

  return Math.min(score, 10);
}

function scoreContactAvailability(content: string): number {
  let score = 0;

  // Phone number pattern
  if (/[6-9]\d{9}|(\+91[\s-]?)?[6-9]\d{9}/i.test(content)) score += 6;

  // Email
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(content)) score += 4;

  // Contact call-to-action
  if (/call|whatsapp|contact|reach|message|enquire/i.test(content)) score += 3;

  // Site visit
  if (/site visit|property visit|schedule visit|visit welcome/i.test(content)) score += 3;

  return Math.min(score, 10);
}

function scoreSellerCredibility(content: string, sellerType: string): number {
  let score = 4; // base

  if (sellerType === 'developer') {
    // Developer credibility signals
    if (/rera registered|rera no|rera approved/i.test(content)) score += 4;
    if (/bank approved|loan available|home loan/i.test(content)) score += 3;
    score += 3; // developer base bonus
  } else if (sellerType === 'broker') {
    if (/verified listing|certified|registered broker/i.test(content)) score += 3;
    score += 2;
  } else {
    // Owner direct = high credibility for buyers
    if (/direct owner|owner direct|no brokerage|zero brokerage/i.test(content)) score += 5;
  }

  return Math.min(score, 10);
}

// ─── MAIN SELLER SCORING FUNCTION ────────────────────────────────────────────
export function scoreSellerSignal(signal: RawSignal, criteria: SellerCriteria): ScoredLead {
  const content = signal.content;
  const sellerType = classifySellerType(content);
  const listingPrice = extractListingPrice(content);

  const priceScore = scorePriceClarity(content, criteria);
  const detailScore = scorePropertyDetail(content, criteria);
  const urgencyScore = scoreSellerUrgency(content);
  const locationScore = scoreLocationClarity(content, criteria);
  const contactScore = scoreContactAvailability(content);
  const credibilityScore = scoreSellerCredibility(content, sellerType);

  const total = Math.round(
    priceScore +      // 15 max
    detailScore +     // 12 max
    urgencyScore +    // 12 max
    locationScore +   // 10 max
    contactScore +    // 10 max
    credibilityScore  // 10 max
  );
  const totalScore = Math.min(Math.max(total, 0), 100);

  let tier: 'hot' | 'warm' | 'cool' | 'watching';
  if (totalScore >= 45) tier = 'hot';
  else if (totalScore >= 28) tier = 'warm';
  else if (totalScore >= 15) tier = 'cool';
  else tier = 'watching';

  return {
    profileHandle: signal.authorHandle || null,
    profileName: signal.authorName || null,
    profileUrl: signal.sourceUrl || null,
    profilePlatform: signal.platform,
    sourcePlatform: signal.platform,
    sourceUrl: signal.sourceUrl || null,
    sourceContent: content,
    sourceType: signal.sourceType,
    capturedAt: signal.capturedAt,
    totalScore,
    tier,
    // Repurpose buyer score fields for seller dimensions
    scoreSpecificity: priceScore,
    scoreBudgetClarity: detailScore,
    scoreUrgency: urgencyScore,
    scoreEngagementVelocity: contactScore,
    scoreDeveloperFollow: credibilityScore,
    scoreContentCreator: 0,
    scoreCrossPlatform: 0,
    scoreFinancialReady: 0,
    scoreLocationLock: locationScore,
    scoreProfileMatch: 5,
    inferredBuyerType: sellerType,
    inferredBudget: listingPrice,
    inferredLocation: extractSellerLocation(content, criteria),
    inferredTimeline: urgencyScore >= 8 ? 'Urgent' : urgencyScore >= 4 ? 'Ready to move' : 'Negotiable',
    isNRI: false,
    nriCountry: null,
    behavioralPatterns: sellerType === 'developer' ? ['developer'] : sellerType === 'broker' ? ['broker'] : ['direct_owner'],
    velocityPattern: null,
  };
}

function extractSellerLocation(content: string, criteria: SellerCriteria): string | null {
  const lower = content.toLowerCase();
  const found: string[] = [];
  for (const market of criteria.microMarkets) {
    if (lower.includes(market.toLowerCase())) found.push(market);
  }
  if (found.length > 0) return found.join(', ');
  if (lower.includes(criteria.city.toLowerCase())) return criteria.city;
  return null;
}
