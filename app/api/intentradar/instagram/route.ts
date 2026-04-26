// app/api/intentradar/instagram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiKey, getSetting } from '@/lib/intentradar/db';

export const maxDuration = 300; // 5 min — Vercel Pro/Hobby max for API routes

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Commenter {
  username: string;
  comment: string;
  postUrl: string;
  timestamp: string;
}

interface MatchedCriteria {
  city: string | false;
  microMarket: string | false;
  propertyType: string | false;
  bhk: string | false;
  budget: string | false;
  buyerIntentComments: number;
  engagementLevel: string;
}

interface ScoredPost {
  url: string;
  commentsCount: number;
  score: number;
  caption: string;
  timestamp: string;
  sourceType: string;
  locationMatch: string;
  freshnessDays: number;
  intentSignals: string[];
  matchedCriteria: MatchedCriteria;
  scoreBreakdown: Record<string, number>;
  reasonSelected: string;
}

interface DebugSummary {
  totalScanned: number;
  rawUrlsFound: number;
  validPostUrls: number;
  rejectedInvalidUrls: number;
  invalidUrlExamples: string[];
  eligibleAfterAgeFilter: number;
  eligibleAfterEngagementFilter: number;
  selectedPosts: number;
  rejectedReasons: Record<string, number>;
}

// ─── Nearby Areas Map ─────────────────────────────────────────────────────────
const NEARBY_AREAS: Record<string, string[]> = {
  // Bangalore North/NE
  'kalyan nagar':    ['hrbr layout', 'kammanahalli', 'banaswadi', 'horamavu', 'hebbal', 'ramamurthy nagar', 'hennur', 'nagawara'],
  'hrbr layout':     ['kalyan nagar', 'kammanahalli', 'banaswadi', 'horamavu', 'hebbal'],
  'kammanahalli':    ['kalyan nagar', 'hrbr layout', 'banaswadi', 'st thomas town', 'hennur'],
  'banaswadi':       ['kalyan nagar', 'hrbr layout', 'horamavu', 'ramamurthy nagar', 'nagawara'],
  'hebbal':          ['kalyan nagar', 'sahakarnagar', 'yelahanka', 'kogilu', 'ms ramaiah', 'nagawara'],
  'yelahanka':       ['hebbal', 'sahakarnagar', 'thanisandra', 'kogilu', 'jakkur'],
  'thanisandra':     ['yelahanka', 'hebbal', 'kogilu', 'jakkur', 'nagawara', 'hennur'],
  'hennur':          ['kalyan nagar', 'banaswadi', 'thanisandra', 'nagawara', 'horamavu'],
  'nagawara':        ['hebbal', 'banaswadi', 'hennur', 'thanisandra', 'hrbr layout'],
  // Bangalore East
  'whitefield':      ['marathahalli', 'brookefield', 'itpl', 'kadugodi', 'varthur', 'hope farm'],
  'marathahalli':    ['whitefield', 'brookefield', 'bellandur', 'sarjapur', 'doddanekundi'],
  'koramangala':     ['btm layout', 'hsr layout', 'ejipura', 'sg palya', 'domlur'],
  'hsr layout':      ['koramangala', 'btm layout', 'bellandur', 'agara', 'sarjapur'],
  'bellandur':       ['marathahalli', 'sarjapur', 'hsr layout', 'kadubeesanahalli', 'varthur'],
  'sarjapur':        ['bellandur', 'hsr layout', 'marathahalli', 'attibele'],
  // Bangalore South
  'jp nagar':        ['bannerghatta', 'gottigere', 'jayanagar', 'btm layout', 'hulimavu'],
  'bannerghatta':    ['jp nagar', 'gottigere', 'hulimavu', 'arekere'],
  'electronic city': ['hsr layout', 'bommanahalli', 'begur', 'anekal', 'sarjapur'],
  // Bangalore West
  'rajajinagar':     ['malleshwaram', 'basaveshwara nagar', 'vijayanagar', 'nagarbhavi'],
  'malleshwaram':    ['rajajinagar', 'sadashivanagar', 'vyalikaval', 'seshadripuram'],
  // Mumbai
  'bandra':          ['khar', 'santacruz', 'andheri', 'juhu', 'bandra east', 'bandra west'],
  'andheri':         ['bandra', 'juhu', 'goregaon', 'lokhandwala', 'versova'],
  'powai':           ['chandivali', 'vikhroli', 'kanjurmarg', 'ghatkopar', 'hiranandani'],
  'thane':           ['ghodbunder', 'majiwada', 'kopri', 'naupada', 'kolshet'],
  'navi mumbai':     ['vashi', 'kharghar', 'nerul', 'belapur', 'panvel'],
  // Pune
  'kharadi':         ['wagholi', 'viman nagar', 'hadapsar', 'mundhwa', 'magarpatta'],
  'hinjewadi':       ['wakad', 'balewadi', 'baner', 'pashan', 'pimple saudagar'],
  'wakad':           ['hinjewadi', 'balewadi', 'baner', 'pimple nilakh'],
  'viman nagar':     ['kharadi', 'nagar road', 'kalyani nagar', 'mundhwa'],
  // Hyderabad
  'gachibowli':      ['financial district', 'nanakramguda', 'kondapur', 'madhapur', 'kokapet'],
  'kondapur':        ['gachibowli', 'madhapur', 'hitech city', 'kukatpally', 'miyapur'],
  'hitech city':     ['kondapur', 'madhapur', 'gachibowli', 'jubilee hills'],
  'kukatpally':      ['kondapur', 'miyapur', 'hitech city', 'bachupally'],
  // Chennai
  'anna nagar':      ['kilpauk', 'aminjikarai', 'thirumangalam', 'chetpet', 'arumbakkam'],
  'omr':             ['sholinganallur', 'perungudi', 'karapakkam', 'siruseri'],
  'velachery':       ['guindy', 'pallavaram', 'medavakkam', 'nanganallur'],
  // Delhi NCR
  'noida':           ['greater noida', 'noida extension', 'indirapuram', 'vaishali'],
  'gurgaon':         ['dwarka expressway', 'sohna road', 'golf course road', 'sector 56'],
  'dwarka':          ['dwarka expressway', 'palam', 'uttam nagar', 'najafgarh'],
};

function getNearbyAreas(microMarkets: string[]): string[] {
  const marketSet = new Set(microMarkets.map(m => m.toLowerCase()));
  const nearby = new Set<string>();
  for (const market of microMarkets) {
    for (const n of NEARBY_AREAS[market.toLowerCase()] || []) {
      if (!marketSet.has(n)) nearby.add(n);
    }
  }
  return Array.from(nearby);
}

// ─── Property Keywords ─────────────────────────────────────────────────────────
// For Apartment: BHK terminology is an implicit apartment signal in India
const PROP_KEYWORDS: Record<string, string[]> = {
  Apartment:    ['apartment', 'flat', 'flats', 'unit', 'residential flat',
                 'bhk', '1bhk', '2bhk', '3bhk', '4bhk', '1 bhk', '2 bhk', '3 bhk', '4 bhk'],
  Villa:        ['villa', 'independent house', 'bungalow', 'independent home', 'duplex villa'],
  Plot:         ['plot', 'land', 'site', 'bda plot', 'layout plot', 'residential plot'],
  Penthouse:    ['penthouse', 'duplex penthouse', 'sky villa', 'luxury flat'],
  'Row House':  ['row house', 'rowhouse', 'townhouse', 'town house'],
  Commercial:   ['commercial', 'office', 'shop', 'showroom', 'retail', 'warehouse'],
};

const WRONG_CATEGORY_MAP: Record<string, string[]> = {
  Apartment:    ['villa', 'bungalow', 'independent house', 'plot', 'land', 'commercial', 'office', 'shop', 'row house', 'rowhouse'],
  Villa:        ['plot', 'land', 'commercial', 'office', 'shop', 'apartment', 'flat'],
  Plot:         ['villa', 'bungalow', 'apartment', 'flat', 'commercial', 'office'],
  Penthouse:    ['plot', 'land', 'commercial', 'villa', 'row house'],
  'Row House':  ['plot', 'land', 'commercial'],
  Commercial:   ['villa', 'bungalow', 'residential', 'apartment', 'flat'],
};

function getPropKeywords(propertyType: string): string[] {
  return PROP_KEYWORDS[propertyType] ?? [propertyType.toLowerCase()];
}

function getBHKKeywords(bhkConfig: string): string[] {
  const num = bhkConfig.match(/\d+/)?.[0] ?? '';
  return [`${num}bhk`, `${num} bhk`, `${num}-bhk`, `${num} bedroom`, `${num}bedroom`, `${num} bed`].filter(Boolean);
}

// ─── Budget Matching ──────────────────────────────────────────────────────────
function matchesBudgetRange(text: string, min: number, max: number, tolerancePct = 0): boolean {
  if (!min || !max) return false;
  const lo = min * (1 - tolerancePct);
  const hi = max * (1 + tolerancePct);
  const lakhRe = /(\d+(?:\.\d+)?)\s*(?:l(?:akh)?s?|lacs?)\b/gi;
  const croreRe = /(\d+(?:\.\d+)?)\s*(?:cr(?:ore)?s?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = lakhRe.exec(text)) !== null) {
    const v = parseFloat(m[1]);
    if (v >= lo && v <= hi) return true;
  }
  while ((m = croreRe.exec(text)) !== null) {
    const v = parseFloat(m[1]) * 100;
    if (v >= lo && v <= hi) return true;
  }
  return false;
}

// ─── Source Quality Detection (25 pts) ───────────────────────────────────────
// Primary verification: account identity (username + fullName + bio) must confirm
// a real estate source. Caption/hashtag signals alone are not sufficient.

// Content-level non-RE signals (hard reject)
const NON_RE_SIGNALS = [
  'meme', 'funny', 'comedy', 'fashion', 'ootd', 'foodie', 'restaurant',
  'travel', 'fitness', 'workout', 'gym', 'beauty', 'makeup', 'skincare',
  'cricket', 'ipl', 'bollywood', 'music', 'dance', 'reel trend',
];

// Account-level non-RE signals — if username/bio contains these, hard reject
const NON_RE_ACCOUNT = [
  'meme', 'funny', 'comedy', 'food', 'restaurant', 'cafe', 'chef', 'foodie',
  'fitness', 'gym', 'workout', 'yoga', 'beauty', 'makeup', 'skincare', 'salon',
  'fashion', 'ootd', 'clothing', 'boutique', 'travel', 'tour', 'trekking',
  'cricket', 'sports', 'ipl', 'music', 'dance', 'bollywood', 'film', 'actor',
  'photography', 'nature', 'lifestyle', 'entertainment', 'comedian', 'influencer',
];

// Developer/builder account + content signals
const DEV_CAPTION = ['new launch', 'pre-launch', 'pre launch', 'under construction',
  'limited units', 'rera approved', 'rera no', 'possession', 'amenities', 'booking open',
  'sample flat', 'site visit', 'bhk starting', 'configuration', 'sqft', 'sq.ft'];
const DEV_HASHTAG = ['newlaunch', 'prelaunches', 'reraapproved', 'underconstruction',
  'newproject', 'newdevelopment', 'readytomove', 'propertylisting'];
const DEV_USERNAME = ['builders', 'constructions', 'infrastructure', 'developers',
  'projects', 'realty', 'homes', 'properties', 'infra', 'construction', 'build',
  'residential', 'housing', 'developer', 'builder'];

// Agent/advisor account signals
const AGENT_CAPTION = ['real estate advisor', 'property consultant', 'dm for details',
  'contact me', 'call me', 'reach me', 'available for', 'exclusive listing'];
const AGENT_USERNAME = ['agent', 'advisor', 'consultant', 'realtor', 'broker',
  'realestate', 'propertydealer', 'propdealer', 'realty', 'estateconsult'];

// Aggregator/portal account signals
const AGG_CAPTION = ['luxury homes in', 'flats in', 'properties in', 'homes for sale in',
  'apartments in', '2bhk in', '3bhk in', 'flat for sale', 'property for sale'];
const AGG_USERNAME = ['flats', 'luxury', 'premium', 'elite', 'nri', 'apartments',
  'propertie', 'realestate', 'homesale', 'proplist'];

// Influencer/creator signals
const INF_CAPTION = ['walkthrough', 'property review', 'investment guide',
  'real estate tips', 'market update', 'property tour'];

// Community/local signals
const COMM_CAPTION = ['nri buyers', 'invest in', 'north bangalore', 'south bangalore',
  'east bangalore', 'west bangalore'];

// Any account-level RE signal — used to validate generic RE content
const RE_ACCOUNT_SIGNALS = [
  'realestate', 'property', 'properties', 'flat', 'flats', 'homes', 'housing',
  'realtor', 'realty', 'estate', 'builder', 'developer', 'infra', 'construct',
  'apartment', 'residential', 'commercial', 'bhk', 'villa', 'plot',
];

type SourceDetectResult = { sourceType: string; sourceScore: number };

function detectSourceType(item: Record<string, unknown>): SourceDetectResult {
  const caption   = ((item.caption as string) || '').toLowerCase();
  const hashtags  = ((item.hashtags as string[]) || []).map(h => h.toLowerCase().replace(/^#/, ''));
  const username  = ((item.ownerUsername || item.username || '') as string).toLowerCase();
  const fullName  = ((item.ownerFullName || item.fullName || '') as string).toLowerCase();
  const biography = ((item.biography || item.bio || '') as string).toLowerCase();
  const accountText = `${username} ${fullName} ${biography}`;

  // Hard reject: non-RE account identity (username/bio reveals non-RE purpose)
  if (NON_RE_ACCOUNT.some(kw => accountText.includes(kw))) {
    return { sourceType: 'non_real_estate', sourceScore: 0 };
  }
  // Hard reject: non-RE content signals in caption/hashtags
  if (NON_RE_SIGNALS.some(kw => caption.includes(kw) || hashtags.some(h => h.includes(kw)))) {
    return { sourceType: 'non_real_estate', sourceScore: 0 };
  }

  const capHas = (kws: string[]) => kws.some(kw => caption.includes(kw));
  const tagHas = (kws: string[]) => kws.some(kw => hashtags.some(h => h.includes(kw)));
  const accHas = (kws: string[]) => kws.some(kw => accountText.includes(kw));

  const isDevAccount   = accHas(DEV_USERNAME);
  const isDevContent   = capHas(DEV_CAPTION) || tagHas(DEV_HASHTAG);
  const isAgentAccount = accHas(AGENT_USERNAME);
  const isAggAccount   = accHas(AGG_USERNAME);

  // Developer: account + content, OR very strong dual content signal
  if (isDevAccount && isDevContent) return { sourceType: 'developer', sourceScore: 25 };
  if (isDevContent && capHas(DEV_CAPTION) && tagHas(DEV_HASHTAG)) {
    // Both caption AND hashtag dev signals without account match → slightly lower confidence
    return { sourceType: 'developer', sourceScore: 20 };
  }

  // Agent: account signal is required; caption alone is not enough
  if (isAgentAccount) return { sourceType: 'agent', sourceScore: 22 };
  if (capHas(AGENT_CAPTION) && accHas(RE_ACCOUNT_SIGNALS)) {
    return { sourceType: 'agent', sourceScore: 18 };
  }

  // Aggregator: account + any RE content
  if (isAggAccount && (capHas(AGG_CAPTION) || tagHas(['realestate', 'propertylisting', 'propertyforsale']))) {
    return { sourceType: 'aggregator', sourceScore: 18 };
  }

  // Influencer: content signal but MUST also have RE account signal
  if ((capHas(INF_CAPTION) || tagHas(['realestateinvestment', 'propertyinvestment', 'realestatetips'])) && accHas(RE_ACCOUNT_SIGNALS)) {
    return { sourceType: 'influencer', sourceScore: 15 };
  }

  // Community: content signal + RE account signal
  if ((capHas(COMM_CAPTION) || tagHas(['nrirealestate', 'northbangalore', 'southbangalore', 'eastbangalore'])) && accHas(RE_ACCOUNT_SIGNALS)) {
    return { sourceType: 'community', sourceScore: 12 };
  }

  // Generic RE: ONLY allowed if account is verifiably RE-related
  const hasREAccount = RE_ACCOUNT_SIGNALS.some(kw => accountText.includes(kw));
  const RE_CONTENT_KWS = ['realestate', 'property', 'flat', 'apartment', 'bhk', 'sqft', 'forsale', 'housing', 'propertyforsale'];
  const hasREContent = RE_CONTENT_KWS.some(kw => caption.includes(kw) || hashtags.some(h => h.includes(kw)));

  if (hasREAccount && hasREContent) {
    return { sourceType: 'real_estate', sourceScore: 8 };
  }

  // Account has no verifiable RE identity → reject regardless of caption content
  return { sourceType: 'non_real_estate', sourceScore: 0 };
}

// ─── Location Scoring (20 pts) ────────────────────────────────────────────────
type LocationResult = { locationScore: number; locationMatch: string; isWrongCity: boolean };

function scoreLocation(fullText: string, city: string, microMarkets: string[]): LocationResult {
  const cityLower = city.toLowerCase();
  const citySlug = cityLower.replace(/[^a-z0-9]/g, '');
  const hasCity = fullText.includes(cityLower) || fullText.includes(citySlug);

  // Check exact micro-market match first
  for (const market of microMarkets) {
    const ml = market.toLowerCase();
    if (fullText.includes(ml) || fullText.includes(ml.replace(/\s/g, ''))) {
      return {
        locationScore: hasCity ? 20 : 16, // slightly lower when city not explicit
        locationMatch: `exact: ${market}`,
        isWrongCity: false,
      };
    }
  }

  // Check nearby areas
  for (const area of getNearbyAreas(microMarkets)) {
    const al = area.toLowerCase();
    if (fullText.includes(al) || fullText.includes(al.replace(/\s/g, ''))) {
      return {
        locationScore: hasCity ? 14 : 10,
        locationMatch: `nearby: ${area}`,
        isWrongCity: false,
      };
    }
  }

  // City mention alone is not enough — must match a micro-market or nearby area
  return { locationScore: 0, locationMatch: 'no match', isWrongCity: true };
}

// ─── Property Scoring (15 pts) ────────────────────────────────────────────────
type PropertyResult = { propertyScore: number; propertyMatch: string | false; bhkMatch: string; isWrongType: boolean };

function scoreProperty(fullText: string, propertyType: string, bhkConfig: string | undefined): PropertyResult {
  const hasCorrect = getPropKeywords(propertyType).some(kw => fullText.includes(kw));
  const hasWrong   = (WRONG_CATEGORY_MAP[propertyType] || []).some(kw => fullText.includes(kw));

  // Wrong type and no correct keyword → reject
  if (hasWrong && !hasCorrect) {
    return { propertyScore: 0, propertyMatch: false, bhkMatch: 'N/A', isWrongType: true };
  }

  let baseScore = 0;
  let propertyMatch: string | false = false;

  if (hasCorrect) {
    baseScore = 10; propertyMatch = 'exact match';
  }
  // Generic "residential" words are not accepted as property type evidence

  // BHK bonus (+5 max, total capped at 15)
  let bhkMatch = bhkConfig ? 'not mentioned' : 'not specified';
  if (bhkConfig) {
    if (getBHKKeywords(bhkConfig).some(kw => fullText.includes(kw))) {
      baseScore = Math.min(15, baseScore + 5);
      bhkMatch = 'exact match';
      propertyMatch = propertyMatch ? `${propertyMatch} + BHK` : 'BHK match';
    }
  }

  return { propertyScore: baseScore, propertyMatch, bhkMatch, isWrongType: false };
}

// ─── Budget Scoring (10 pts) ──────────────────────────────────────────────────
type BudgetResult = { budgetScore: number; budgetMatch: string | false };

function scoreBudget(fullText: string, budgetMin: number, budgetMax: number): BudgetResult {
  if (!budgetMin || !budgetMax) return { budgetScore: 2, budgetMatch: 'not specified' };
  if (matchesBudgetRange(fullText, budgetMin, budgetMax, 0))    return { budgetScore: 10, budgetMatch: 'within range' };
  if (matchesBudgetRange(fullText, budgetMin, budgetMax, 0.15)) return { budgetScore: 7,  budgetMatch: 'within ±15%' };
  if (matchesBudgetRange(fullText, budgetMin, budgetMax, 0.25)) return { budgetScore: 4,  budgetMatch: 'within ±25%' };
  const hasPrice = /(\d+(?:\.\d+)?)\s*(?:l(?:akh)?s?|lacs?|cr(?:ore)?s?)\b/i.test(fullText);
  if (!hasPrice) return { budgetScore: 2, budgetMatch: 'no price mentioned' };
  return { budgetScore: 0, budgetMatch: false }; // price mentioned but outside range
}

// ─── Freshness Scoring (10 pts) ───────────────────────────────────────────────
type FreshnessResult = { freshnessScore: number; freshnessDays: number; tooOld: boolean };

function scoreFreshness(ts: string, isDeveloper: boolean): FreshnessResult {
  if (!ts) return { freshnessScore: 5, freshnessDays: -1, tooOld: false };
  const ageMs   = Date.now() - new Date(ts).getTime();
  const ageDays = Math.floor(ageMs / 86_400_000);
  const maxDays = isDeveloper ? 180 : 90;
  if (ageDays > maxDays) return { freshnessScore: 0, freshnessDays: ageDays, tooOld: true };
  if (ageDays <=  7) return { freshnessScore: 10, freshnessDays: ageDays, tooOld: false };
  if (ageDays <= 14) return { freshnessScore:  9, freshnessDays: ageDays, tooOld: false };
  if (ageDays <= 30) return { freshnessScore:  7, freshnessDays: ageDays, tooOld: false };
  if (ageDays <= 60) return { freshnessScore:  5, freshnessDays: ageDays, tooOld: false };
  if (ageDays <= 90) return { freshnessScore:  3, freshnessDays: ageDays, tooOld: false };
  return { freshnessScore: 1, freshnessDays: ageDays, tooOld: false }; // 91-180 developer
}

// ─── Engagement Scoring (10 pts) — comments only ─────────────────────────────
function scoreEngagement(comments: number): number {
  if (comments >= 500) return 10;
  if (comments >= 200) return  9;
  if (comments >= 100) return  8;
  if (comments >=  50) return  6;
  if (comments >=  20) return  4;
  if (comments >=  10) return  2;
  return 0;
}

// ─── Intent Scoring (10 pts) ─────────────────────────────────────────────────
const BUYER_CTA = [
  'for sale', 'available', 'dm for', 'dm me', 'contact', 'call', 'whatsapp',
  'price on request', 'check link', 'link in bio', 'visit us', 'booking open',
  'limited units', 'hurry', 'last few',
];
const LISTING_LANG = [
  'new launch', 'pre-launch', 'pre launch', 'under construction', 'rera approved',
  'ready to move', 'possession', 'new project', 'just launched', 'introducing',
];
const COMMENT_INTENT_PHRASES = [
  'price', 'cost', 'details', 'interested', 'site visit', 'contact', 'possession',
  'loan', 'booking', 'send details', 'brochure', 'floor plan', 'how much', 'rate',
  'emi', 'ready to move', 'whatsapp', 'dm me', 'enquiry', 'inquiry', 'sqft',
  'available', 'what price', 'price please',
];

function countBuyerIntentComments(item: Record<string, unknown>): number {
  const list = (
    (item.latestComments  as Record<string, unknown>[]) ||
    (item.previewComments as Record<string, unknown>[]) ||
    (item.comments        as Record<string, unknown>[]) ||
    []
  );
  let count = 0;
  for (const c of list) {
    const text = ((c.text || c.comment || c.body || '') as string).toLowerCase();
    if (COMMENT_INTENT_PHRASES.some(ph => text.includes(ph))) count++;
  }
  return count;
}

type IntentResult = { intentScore: number; intentSignals: string[]; buyerIntentComments: number };

function scoreIntent(item: Record<string, unknown>, captionText: string): IntentResult {
  const signals: string[] = [];
  const hasBuyerCTA    = BUYER_CTA.some(kw => captionText.includes(kw));
  const hasListingLang = LISTING_LANG.some(kw => captionText.includes(kw));
  if (hasBuyerCTA)    signals.push('buyer_cta_in_caption');
  if (hasListingLang) signals.push('listing_language_in_caption');

  const buyerIntentComments = countBuyerIntentComments(item);
  if (buyerIntentComments >= 5) signals.push(`${buyerIntentComments}_buyer_intent_comments`);
  else if (buyerIntentComments >= 2) signals.push(`${buyerIntentComments}_buyer_intent_comments`);
  else if (buyerIntentComments === 1) signals.push('1_buyer_intent_comment');

  // Base score from caption
  let intentScore = 0;
  if (hasBuyerCTA && hasListingLang) intentScore = 8; // both = highest
  else if (hasBuyerCTA)              intentScore = 6;
  else if (hasListingLang)           intentScore = 5;

  // Bonus from comments (capped at 10 total)
  if (buyerIntentComments >= 5)      intentScore = Math.min(10, intentScore + 3);
  else if (buyerIntentComments >= 2) intentScore = Math.min(10, intentScore + 2);
  else if (buyerIntentComments >= 1) intentScore = Math.min(10, intentScore + 1);

  // No signals but no preview data either → neutral
  const previewArr = item.latestComments || item.previewComments || item.comments;
  const hasPreview = Array.isArray(previewArr) && (previewArr as unknown[]).length > 0;
  if (signals.length === 0 && !hasPreview) intentScore = 3;

  return { intentScore, intentSignals: signals, buyerIntentComments };
}

// ─── Main Scoring Function ────────────────────────────────────────────────────
// Scoring: Source (25) + Location (20) + Property (15) + Budget (10)
//        + Freshness (10) + Engagement (10) + Intent (10) = 100

interface ScoreResult {
  score: number;
  sourceType: string;
  locationMatch: string;
  freshnessDays: number;
  intentSignals: string[];
  matchedCriteria: MatchedCriteria;
  scoreBreakdown: Record<string, number>;
  reasonSelected: string;
  hardReject?: string;
}

function scorePost(
  item: Record<string, unknown>,
  city: string,
  microMarkets: string[],
  propertyType: string,
  bhkConfig: string | undefined,
  budgetMin: number,
  budgetMax: number,
  sourceType: string,
  sourceScore: number,
): ScoreResult {
  const caption = ((item.caption as string) || '').toLowerCase();
  const hashtags = ((item.hashtags as string[]) || []).map(h => h.toLowerCase());
  const locationName = ((item.locationName || item.location || '') as string).toLowerCase();
  const fullText = `${caption} ${hashtags.join(' ')} ${locationName}`;
  const ts = (item.timestamp as string) || '';
  const comments = Number(item.commentsCount ?? item.commentCount ?? 0);

  // Location (20 pts) — wrong city = hard reject
  const { locationScore, locationMatch, isWrongCity } = scoreLocation(fullText, city, microMarkets);
  if (isWrongCity) return { score: 0, sourceType, locationMatch, freshnessDays: 0, intentSignals: [], matchedCriteria: emptyMatchedCriteria(), scoreBreakdown: {}, reasonSelected: '', hardReject: 'wrong_city' };

  // Property (15 pts)
  const { propertyScore, propertyMatch, bhkMatch, isWrongType } = scoreProperty(fullText, propertyType, bhkConfig);

  // Budget (10 pts)
  const { budgetScore, budgetMatch } = scoreBudget(fullText, budgetMin, budgetMax);

  // Freshness (10 pts)
  const isDeveloper = sourceType === 'developer';
  const { freshnessScore, freshnessDays, tooOld } = scoreFreshness(ts, isDeveloper);
  if (tooOld) return { score: 0, sourceType, locationMatch, freshnessDays, intentSignals: [], matchedCriteria: emptyMatchedCriteria(), scoreBreakdown: {}, reasonSelected: '', hardReject: 'too_old' };

  // Engagement (10 pts)
  const engagementScore = scoreEngagement(comments);

  // Intent (10 pts)
  const { intentScore, intentSignals, buyerIntentComments } = scoreIntent(item, caption);

  const total = sourceScore + locationScore + propertyScore + budgetScore + freshnessScore + engagementScore + intentScore;

  const scoreBreakdown: Record<string, number> = {
    source: sourceScore,
    location: locationScore,
    property: propertyScore,
    budget: budgetScore,
    freshness: freshnessScore,
    engagement: engagementScore,
    intent: intentScore,
  };

  // Build MatchedCriteria (for frontend badge rendering — backward compat)
  const matchedCriteria: MatchedCriteria = {
    city: !isWrongCity ? 'match' : false,
    microMarket: locationMatch.startsWith('exact:') || locationMatch.startsWith('nearby:') ? locationMatch : false,
    propertyType: propertyMatch,
    bhk: bhkMatch,
    budget: budgetMatch,
    buyerIntentComments,
    engagementLevel: comments >= 100 ? 'high' : comments >= 20 ? 'moderate' : 'minimum',
  };

  // Build reason text
  const parts: string[] = [];
  if (sourceType && sourceType !== 'unknown' && sourceType !== 'real_estate') parts.push(sourceType.replace('_', ' '));
  if (locationMatch && !locationMatch.includes('no match')) {
    parts.push(locationMatch.replace('exact: ', '').replace('nearby: ', 'near '));
  }
  if (propertyMatch) parts.push(String(propertyMatch).replace(' + BHK', '') + (bhkMatch === 'exact match' && bhkConfig ? ` ${bhkConfig}` : ''));
  if (budgetMatch && budgetMatch !== 'not specified' && budgetMatch !== 'no price mentioned') parts.push(`budget ${budgetMatch}`);
  if (freshnessDays >= 0 && freshnessDays <= 7) parts.push('very recent');
  if (intentSignals.length > 0) parts.push(intentSignals[0].replace(/_/g, ' ').replace(/\d+_/, ''));
  const reasonSelected = parts.length > 0 ? parts.join(' · ') : 'Matched by relevance score';

  return { score: total, sourceType, locationMatch, freshnessDays, intentSignals, matchedCriteria, scoreBreakdown, reasonSelected, hardReject: isWrongType ? 'wrong_property_type' : undefined };
}

function emptyMatchedCriteria(): MatchedCriteria {
  return { city: false, microMarket: false, propertyType: false, bhk: false, budget: false, buyerIntentComments: 0, engagementLevel: 'minimum' };
}

function deriveMatchedConditions(mc: MatchedCriteria): string[] {
  const out: string[] = [];
  if (mc.city) out.push('city');
  if (mc.microMarket) out.push('location');
  if (mc.propertyType) out.push('property_type');
  if (mc.bhk === 'exact match') out.push('bhk');
  if (mc.budget && mc.budget !== 'not specified' && mc.budget !== 'no price mentioned') out.push('budget');
  if (mc.buyerIntentComments >= 2) out.push('buyer_intent');
  return out;
}

// ─── URL Validation & Normalization ──────────────────────────────────────────
const VALID_IG_POST_RE = /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]{5,})\/?/;

function isValidInstagramPostUrl(url: string): boolean {
  return VALID_IG_POST_RE.test(url);
}

function normalizeInstagramUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]{5,})/);
  if (!m) return null;
  return `https://www.instagram.com/${m[2]}/${m[3]}/`;
}

function classifyInvalidUrl(url: string): string {
  if (!url) return 'missing_shortcode';
  const lower = url.toLowerCase();
  if (!lower.includes('instagram.com')) return 'invalid_url';
  if (lower.includes('/explore/')) return 'invalid_url';
  if (lower.includes('/stories/') || lower.includes('/highlights/')) return 'invalid_url';
  if (lower.includes('/search')) return 'invalid_url';
  if (lower.includes('/reel/') || lower.includes('/p/')) return 'invalid_url';
  return 'invalid_url';
}

function extractPostUrl(item: Record<string, unknown>): string | null {
  const rawUrl = ((item.url || item.postUrl || '') as string).trim();
  if (isValidInstagramPostUrl(rawUrl)) return normalizeInstagramUrl(rawUrl);
  const sc = ((item.shortCode || item.shortcode || item.postShortCode || item.code || '') as string).trim();
  if (/^[A-Za-z0-9_-]{5,}$/.test(sc)) {
    const typeHint = ((item.type || item.mediaType || item.productType || '') as string).toLowerCase();
    const isReel = typeHint.includes('video') || rawUrl.includes('/reel/');
    return `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${sc}/`;
  }
  return null;
}

// ─── Hashtag Generator ────────────────────────────────────────────────────────
export function generateSearchHashtags(inputs: {
  city: string;
  microMarkets: string[];
  propertyType: string;
  bhkConfig?: string;
  customHashtags?: string[];
}): { hashtags: string[]; nearbyAreas: string[] } {
  const { city, microMarkets, propertyType, bhkConfig, customHashtags } = inputs;
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '');
  const propSlug = propertyType.toLowerCase().replace(/[^a-z]/g, '');
  const bhkSlug  = bhkConfig ? bhkConfig.toLowerCase().replace(/\s/g, '') : '';
  const tags = new Set<string>();

  // City-level
  tags.add(`${citySlug}realestate`);
  tags.add(`${citySlug}property`);
  tags.add(`${citySlug}${propSlug}`);
  tags.add(`${citySlug}properties`);
  tags.add(`${citySlug}flats`);
  tags.add(`${citySlug}homes`);
  tags.add(`${citySlug}apartments`);
  tags.add(`readytomove${citySlug}`);
  tags.add(`new${propSlug}${citySlug}`);
  tags.add(`${citySlug}newproject`);

  if (bhkSlug) {
    tags.add(`${bhkSlug}${citySlug}`);
    tags.add(`${citySlug}${bhkSlug}`);
    tags.add(`${bhkSlug}${propSlug}`);
    tags.add(`${bhkSlug}forsale`);
  }

  for (const market of microMarkets.slice(0, 5)) {
    const mSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '');
    tags.add(mSlug);
    tags.add(`${mSlug}${propSlug}`);
    tags.add(`${citySlug}${mSlug}`);
    tags.add(`${mSlug}realestate`);
    tags.add(`${mSlug}property`);
    if (bhkSlug) { tags.add(`${bhkSlug}${mSlug}`); tags.add(`${mSlug}${bhkSlug}`); }
  }

  const nearbyAreas = getNearbyAreas(microMarkets);
  for (const area of nearbyAreas.slice(0, 6)) {
    const aSlug = area.toLowerCase().replace(/[^a-z0-9]/g, '');
    tags.add(aSlug);
    if (bhkSlug) tags.add(`${bhkSlug}${aSlug}`);
  }

  tags.add(`${propSlug}forsale`);
  tags.add('indianrealestate');
  tags.add('readytomovein');
  tags.add('reraapproved');
  tags.add('newlaunch');

  if (customHashtags) {
    for (const tag of customHashtags) {
      tags.add(tag.replace(/^#/, '').replace(/\s/g, '').toLowerCase());
    }
  }

  return { hashtags: Array.from(tags).filter(Boolean).slice(0, 20), nearbyAreas: nearbyAreas.slice(0, 6) };
}

// ─── Apify Helpers (unchanged) ─────────────────────────────────────────────────
function normalizeActorId(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  const normalized = trimmed.replace('/', '~');
  return normalized.includes('~') ? normalized : 'apify~instagram-scraper';
}

async function runApifyActor(actorId: string, input: object, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (!res.ok) throw new Error(`Apify actor start failed: ${await res.text()}`);
  return (await res.json()).data.id;
}

async function waitForApifyRun(runId: string, apiKey: string, maxWaitMs = 270000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res  = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
    const data = await res.json();
    const status = data.data?.status;
    if (status === 'SUCCEEDED') return data.data.defaultDatasetId;
    if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Apify run ${status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Apify run timed out after 4.5 minutes — try fewer micro-markets or custom hashtags');
}

async function fetchApifyDataset(datasetId: string, apiKey: string): Promise<unknown[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&clean=true&format=json`
  );
  return res.json();
}

// ─── Comment Extraction (DO NOT MODIFY) ───────────────────────────────────────
async function extractCommenters(
  postUrls: string[],
  limit: number,
  commentActorId: string,
  apiKey: string,
): Promise<Commenter[]> {
  const isStandard = commentActorId === 'apify~instagram-scraper';
  const perPostLimit = Math.min(Math.ceil(limit / postUrls.length) + 30, 500);

  const input = isStandard
    ? { directUrls: postUrls, resultsType: 'comments', resultsLimit: perPostLimit }
    : { directUrls: postUrls, postUrls, resultsLimit: perPostLimit };

  const runId     = await runApifyActor(commentActorId, input, apiKey);
  const datasetId = await waitForApifyRun(runId, apiKey);
  const items     = await fetchApifyDataset(datasetId, apiKey) as Record<string, unknown>[];

  const seen       = new Set<string>();
  const commenters: Commenter[] = [];

  for (const item of items) {
    const username = (item.ownerUsername || item.username || item.authorUsername) as string | undefined;
    if (!username || seen.has(username)) continue;
    seen.add(username);
    const text = (item.text || item.comment || '') as string;
    const sc   = item.postShortCode as string | undefined;
    commenters.push({
      username,
      comment:   text,
      postUrl:   (item.postUrl as string) || (item.url as string) || (sc ? `https://www.instagram.com/p/${sc}/` : ''),
      timestamp: (item.timestamp as string) || new Date().toISOString(),
    });
  }

  return commenters.slice(0, limit);
}

// ─── POST Handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      city         = '',
      microMarkets = [],
      budgetMin    = 0,
      budgetMax    = 0,
      propertyType = 'Apartment',
      bhkConfig,
      customHashtags = [],
      manualPostUrls = [],
      resultsLimit   = 100,
    } = body;

    const excludedUrls = new Set<string>((body.excludedUrls as string[]) || []);

    const apifyKey = await getApiKey('apify');
    if (!apifyKey) {
      return NextResponse.json(
        { error: 'Apify API Key not configured. Please add it in IntentRadar Settings.' },
        { status: 400 }
      );
    }

    const commentActorId = normalizeActorId(await getSetting('actor_instagram_comments'));

    // ── MODE A: Manual URLs — validate → extract commenters (no scoring) ──────
    const rawManualUrls = [...new Set((manualPostUrls as string[]).filter(Boolean))];
    const manualUrls: string[]    = [];
    const manualRejected: string[] = [];
    for (const u of rawManualUrls.slice(0, 10)) {
      const normalized = normalizeInstagramUrl(u);
      if (normalized) manualUrls.push(normalized);
      else manualRejected.push(u);
    }

    if (rawManualUrls.length > 0) {
      if (manualUrls.length === 0) {
        return NextResponse.json({
          error: `None of the provided URLs are valid Instagram post or reel links. ` +
            `Only instagram.com/p/{id}/ or /reel/{id}/ URLs are accepted. ` +
            `Rejected: ${manualRejected.slice(0, 3).join(', ')}`,
        }, { status: 400 });
      }
      const commenters = await extractCommenters(manualUrls, resultsLimit, commentActorId, apifyKey);
      return NextResponse.json({
        commenters,
        totalFound:   commenters.length,
        postsScraped: manualUrls.length,
        topPosts: manualUrls.map(url => ({
          url, commentsCount: 0, score: 0, caption: 'Manual URL',
          sourceType: 'manual', locationMatch: 'N/A', freshnessDays: 0,
          engagement: { comments: 0 }, intentSignals: [],
          matchedConditions: ['manual'], matchedCriteria: null,
          reasonSelected: 'Manual URL — criteria not applied',
        })),
        hashtags: [], nearbyAreas: [], mode: 'manual',
        ...(manualRejected.length > 0 && { manualRejected }),
      });
    }

    // ── MODE B: Auto-discovery ────────────────────────────────────────────────
    if (!city.trim()) {
      return NextResponse.json({ error: 'City is required when no post URLs are provided.' }, { status: 400 });
    }

    // Step 1: Generate hashtags + nearby areas
    const { hashtags, nearbyAreas } = generateSearchHashtags({ city, microMarkets, propertyType, bhkConfig, customHashtags });
    const hashtagUrls = hashtags.map(tag => `https://www.instagram.com/explore/tags/${tag}/`);

    const postRunId    = await runApifyActor('apify~instagram-scraper', { directUrls: hashtagUrls, resultsType: 'posts', resultsLimit: 60 }, apifyKey);
    const postDatasetId = await waitForApifyRun(postRunId, apifyKey);
    const rawItems      = await fetchApifyDataset(postDatasetId, apifyKey) as Record<string, unknown>[];

    // Sort newest-first so the scoring pipeline always evaluates recent posts before older ones
    // (Apify returns hashtag "Top posts" first by default, which tend to be older/viral)
    const postItems = rawItems.slice().sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp as string).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp as string).getTime() : 0;
      return tb - ta;
    });

    // Step 2: URL validation
    const debug: DebugSummary = {
      totalScanned: postItems.length,
      rawUrlsFound: postItems.length,
      validPostUrls: 0,
      rejectedInvalidUrls: 0,
      invalidUrlExamples: [],
      eligibleAfterAgeFilter: 0,
      eligibleAfterEngagementFilter: 0,
      selectedPosts: 0,
      rejectedReasons: {},
    };
    const bump = (key: string) => { debug.rejectedReasons[key] = (debug.rejectedReasons[key] || 0) + 1; };

    const validItems: Record<string, unknown>[] = [];
    for (const item of postItems) {
      const postUrl = extractPostUrl(item);
      if (!postUrl) {
        debug.rejectedInvalidUrls++;
        const raw = (item.url || '') as string;
        if (debug.invalidUrlExamples.length < 5) debug.invalidUrlExamples.push(raw || '(empty)');
        bump('invalid_url');
        continue;
      }
      debug.validPostUrls++;
      validItems.push({ ...item, url: postUrl });
    }

    // Step 3: Filter + Score
    const SIX_MONTHS_MS   = 180 * 86_400_000;
    const THREE_MONTHS_MS  =  90 * 86_400_000;
    const scoredPosts: ScoredPost[] = [];

    for (const item of validItems) {
      const itemUrl = item.url as string;
      if (excludedUrls.has(itemUrl)) { bump('already_scraped'); continue; }

      const ts       = (item.timestamp as string) || '';
      const comments = Number(item.commentsCount ?? item.commentCount ?? 0);

      // Source quality detection (needed for age threshold)
      const { sourceType, sourceScore } = detectSourceType(item);
      if (sourceType === 'non_real_estate') { bump('non_real_estate'); continue; }

      // Age filter — developer posts allowed up to 180 days
      const isDeveloper = sourceType === 'developer';
      const maxAgeMs    = isDeveloper ? SIX_MONTHS_MS : THREE_MONTHS_MS;
      if (ts && Date.now() - new Date(ts).getTime() > maxAgeMs) { bump('too_old'); continue; }
      debug.eligibleAfterAgeFilter++;

      // Engagement filter: comments ≥ 10 AND ≤ 5000 (no likes/views)
      if (comments < 10)   { bump('low_comments');       continue; }
      if (comments > 5000) { bump('too_many_comments');   continue; }
      debug.eligibleAfterEngagementFilter++;

      // Full scoring
      const result = scorePost(item, city, microMarkets, propertyType, bhkConfig, Number(budgetMin), Number(budgetMax), sourceType, sourceScore);

      if (result.hardReject) { bump(result.hardReject); continue; }
      if (result.score < 40) { bump('weak_score');       continue; }

      scoredPosts.push({
        url: itemUrl,
        commentsCount: comments,
        score: result.score,
        caption: ((item.caption as string) || '').slice(0, 120),
        timestamp: ts || new Date().toISOString(),
        sourceType: result.sourceType,
        locationMatch: result.locationMatch,
        freshnessDays: result.freshnessDays,
        intentSignals: result.intentSignals,
        matchedCriteria: result.matchedCriteria,
        scoreBreakdown: result.scoreBreakdown,
        reasonSelected: result.reasonSelected,
      });
    }

    // Step 4: Select — primary ≥55, fallback ≥40
    const primary  = scoredPosts.filter(p => p.score >= 55);
    const selected = primary.length >= 5 ? primary : scoredPosts.filter(p => p.score >= 40);

    // Sort: score → buyer intent comments → recency
    selected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const abi = b.matchedCriteria.buyerIntentComments;
      const aai = a.matchedCriteria.buyerIntentComments;
      if (abi !== aai) return abi - aai;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const topPosts = selected.slice(0, 20);
    debug.selectedPosts = topPosts.length;

    for (const p of scoredPosts) {
      if (!topPosts.includes(p)) bump('weak_score');
    }

    if (topPosts.length === 0) {
      return NextResponse.json({
        error: `No qualifying posts found for ${city} · ${propertyType}${bhkConfig ? ` ${bhkConfig}` : ''}. ` +
          `Try adding more micro-markets or paste specific post URLs directly.`,
        hashtags, nearbyAreas, debugSummary: debug, mode: 'hashtag',
      }, { status: 400 });
    }

    // Step 5: Extract commenters (unchanged)
    const postUrls   = topPosts.map(p => p.url);
    const commenters = await extractCommenters(postUrls, resultsLimit, commentActorId, apifyKey);

    return NextResponse.json({
      commenters,
      totalFound:   commenters.length,
      postsScraped: topPosts.length,
      topPosts: topPosts.slice(0, 10).map(p => ({
        url:          p.url,
        commentsCount: p.commentsCount,
        score:        p.score,
        caption:      p.caption,
        sourceType:   p.sourceType,
        locationMatch: p.locationMatch,
        freshnessDays: p.freshnessDays,
        engagement:   { comments: p.commentsCount },
        intentSignals: p.intentSignals,
        matchedConditions: deriveMatchedConditions(p.matchedCriteria),
        matchedCriteria:   p.matchedCriteria,
        scoreBreakdown:    p.scoreBreakdown,
        reasonSelected:    p.reasonSelected,
      })),
      hashtags,
      nearbyAreas,
      mode: 'hashtag',
      debugSummary: debug,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Mining failed';
    console.error('Instagram miner error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
