// app/api/intentradar/instagram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiKey, getSetting } from '@/lib/intentradar/db';

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
  matchedCriteria: MatchedCriteria;
  scoreBreakdown: Record<string, number>;
  reasonSelected: string;
  rejectionReason?: string;
}

interface DebugSummary {
  totalScanned: number;
  eligibleAfterAgeFilter: number;
  eligibleAfterEngagementFilter: number;
  selectedPosts: number;
  rejectedReasons: Record<string, number>;
}

// ─── Nearby Areas Map ─────────────────────────────────────────────────────────
const NEARBY_AREAS: Record<string, string[]> = {
  // Bangalore North/NE
  'kalyan nagar':    ['hrbr layout', 'kammanahalli', 'banaswadi', 'horamavu', 'hebbal', 'ramamurthy nagar'],
  'hrbr layout':     ['kalyan nagar', 'kammanahalli', 'banaswadi', 'horamavu'],
  'kammanahalli':    ['kalyan nagar', 'hrbr layout', 'banaswadi', 'st thomas town'],
  'banaswadi':       ['kalyan nagar', 'hrbr layout', 'horamavu', 'ramamurthy nagar'],
  'hebbal':          ['kalyan nagar', 'sahakarnagar', 'yelahanka', 'kogilu', 'ms ramaiah'],
  'yelahanka':       ['hebbal', 'sahakarnagar', 'thanisandra', 'kogilu', 'jakkur'],
  'thanisandra':     ['yelahanka', 'hebbal', 'kogilu', 'jakkur', 'nagawara'],
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
const PROP_KEYWORDS: Record<string, string[]> = {
  Apartment:    ['apartment', 'flat', 'flats', 'unit', 'residential flat'],
  Villa:        ['villa', 'independent house', 'bungalow', 'independent home', 'duplex villa'],
  Plot:         ['plot', 'land', 'site', 'bda plot', 'layout plot', 'residential plot'],
  Penthouse:    ['penthouse', 'duplex penthouse', 'sky villa', 'luxury flat'],
  'Row House':  ['row house', 'rowhouse', 'townhouse', 'town house'],
  Commercial:   ['commercial', 'office', 'shop', 'showroom', 'retail', 'warehouse'],
};

const WRONG_CATEGORY_MAP: Record<string, string[]> = {
  Apartment:    ['villa', 'bungalow', 'plot', 'land', 'commercial', 'office', 'shop'],
  Villa:        ['plot', 'land', 'commercial', 'office', 'shop'],
  Plot:         ['villa', 'bungalow', 'commercial', 'office'],
  Penthouse:    ['plot', 'land', 'commercial', 'villa', 'row house'],
  'Row House':  ['plot', 'land', 'commercial'],
  Commercial:   ['villa', 'bungalow', 'residential'],
};

function getPropKeywords(propertyType: string): string[] {
  return PROP_KEYWORDS[propertyType] ?? [propertyType.toLowerCase()];
}

function getBHKKeywords(bhkConfig: string): string[] {
  const num = bhkConfig.match(/\d+/)?.[0] ?? '';
  return [`${num}bhk`, `${num} bhk`, `${num}-bhk`, `${num} bedroom`, `${num}bedroom`, `${num} bed`].filter(Boolean);
}

// ─── Budget Matching ───────────────────────────────────────────────────────────
function matchesBudgetRange(text: string, budgetMin: number, budgetMax: number, tolerancePct = 0): boolean {
  if (!budgetMin || !budgetMax) return false;
  const extMin = budgetMin * (1 - tolerancePct);
  const extMax = budgetMax * (1 + tolerancePct);
  const lakhPattern = /(\d+(?:\.\d+)?)\s*(?:l(?:akh)?s?|lacs?)\b/gi;
  const crorePattern = /(\d+(?:\.\d+)?)\s*(?:cr(?:ore)?s?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = lakhPattern.exec(text)) !== null) {
    if (parseFloat(m[1]) >= extMin && parseFloat(m[1]) <= extMax) return true;
  }
  while ((m = crorePattern.exec(text)) !== null) {
    if (parseFloat(m[1]) * 100 >= extMin && parseFloat(m[1]) * 100 <= extMax) return true;
  }
  return false;
}

// ─── Buyer Intent Detection ────────────────────────────────────────────────────
const BUYER_INTENT_PHRASES = [
  'price', 'cost', 'details', 'interested', 'site visit', 'contact',
  'possession', 'loan', 'booking', 'send details', 'brochure', 'floor plan',
  'how much', 'rate', 'emi', 'ready to move', 'whatsapp', 'call me',
  'dm me', 'inbox', 'enquiry', 'inquiry', 'sqft', 'sq ft', 'available',
  'what price', 'price please', 'price?', 'can i get details', 'interested',
];

function countBuyerIntentComments(item: Record<string, unknown>): number {
  const list = (
    (item.latestComments as Record<string, unknown>[]) ||
    (item.previewComments as Record<string, unknown>[]) ||
    (item.comments as Record<string, unknown>[]) ||
    []
  );
  let count = 0;
  for (const c of list) {
    const text = ((c.text || c.comment || c.body || '') as string).toLowerCase();
    if (BUYER_INTENT_PHRASES.some(phrase => text.includes(phrase))) count++;
  }
  return count;
}

// ─── Weighted Scoring (A–G, max 100) ─────────────────────────────────────────
// A: City (25) + B: Micro-Market (25) + C: Property Type (15) +
// D: BHK (10)  + E: Budget (10)       + F: Buyer Intent (10)  + G: Engagement (5)

function scorePost(
  item: Record<string, unknown>,
  city: string,
  microMarkets: string[],
  propertyType: string,
  bhkConfig: string | undefined,
  budgetMin: number,
  budgetMax: number,
): { score: number; matchedCriteria: MatchedCriteria; scoreBreakdown: Record<string, number>; rejectionReason?: string } {
  const caption = ((item.caption as string) || '').toLowerCase();
  const hashtagsArr = ((item.hashtags as string[]) || []).map(h => h.toLowerCase());
  const locationName = ((item.locationName || item.location || '') as string).toLowerCase();
  const fullText = `${caption} ${hashtagsArr.join(' ')} ${locationName}`;

  const cityLower = city.toLowerCase();
  const citySlug = cityLower.replace(/[^a-z0-9]/g, '');
  const comments = Number(item.commentsCount ?? item.commentCount ?? 0);
  const likes = Number(item.likesCount ?? item.likes ?? 0);

  // A. City Match — 25 pts
  let cityScore = 0;
  let cityMatch: string | false = false;
  if (fullText.includes(cityLower) || fullText.includes(citySlug)) {
    cityScore = 25; cityMatch = 'exact match';
  }

  // B. Micro-Market Match — 25 pts
  let microMarketScore = 0;
  let microMarketMatch: string | false = false;

  for (const market of microMarkets) {
    const ml = market.toLowerCase();
    if (fullText.includes(ml) || fullText.includes(ml.replace(/\s/g, ''))) {
      microMarketScore = 25; microMarketMatch = `exact: ${market}`; break;
    }
  }
  if (microMarketScore === 0) {
    for (const area of getNearbyAreas(microMarkets)) {
      const al = area.toLowerCase();
      if (fullText.includes(al) || fullText.includes(al.replace(/\s/g, ''))) {
        microMarketScore = 18; microMarketMatch = `nearby: ${area}`; break;
      }
    }
  }
  if (microMarketScore === 0 && cityScore > 0) {
    microMarketScore = 10; microMarketMatch = 'city-zone match';
  }

  // C. Property Type — 15 pts (wrong category → 0)
  let propertyTypeScore = 0;
  let propertyTypeMatch: string | false = false;
  let rejectionReason: string | undefined;

  const hasCorrect = getPropKeywords(propertyType).some(kw => fullText.includes(kw));
  const hasWrong = (WRONG_CATEGORY_MAP[propertyType] || []).some(kw => fullText.includes(kw));

  if (hasCorrect) {
    propertyTypeScore = 15; propertyTypeMatch = 'exact match';
  } else if (hasWrong) {
    propertyTypeScore = 0; rejectionReason = 'wrong_property_type';
  } else {
    const residential = ['property', 'home', 'house', 'residence', 'residential', 'housing', 'realty'];
    if (residential.some(kw => fullText.includes(kw))) {
      propertyTypeScore = 10; propertyTypeMatch = 'residential match';
    }
  }

  // D. BHK — 10 pts
  let bhkScore = 0;
  let bhkMatch: string | false = false;
  if (bhkConfig) {
    if (getBHKKeywords(bhkConfig).some(kw => fullText.includes(kw))) {
      bhkScore = 10; bhkMatch = 'exact match';
    } else {
      bhkScore = 4; bhkMatch = 'not mentioned';
    }
  } else {
    bhkScore = 5; bhkMatch = 'not specified';
  }

  // E. Budget — 10 pts
  let budgetScore = 0;
  let budgetMatch: string | false = false;
  if (budgetMin && budgetMax) {
    if (matchesBudgetRange(fullText, budgetMin, budgetMax, 0)) {
      budgetScore = 10; budgetMatch = 'within range';
    } else if (matchesBudgetRange(fullText, budgetMin, budgetMax, 0.15)) {
      budgetScore = 7; budgetMatch = 'within ±15%';
    } else if (matchesBudgetRange(fullText, budgetMin, budgetMax, 0.25)) {
      budgetScore = 4; budgetMatch = 'within ±25%';
    } else {
      const anyPrice = /(\d+(?:\.\d+)?)\s*(?:l(?:akh)?s?|lacs?|cr(?:ore)?s?)\b/i.test(fullText);
      if (!anyPrice) { budgetScore = 2; budgetMatch = 'no price mentioned'; }
    }
  } else {
    budgetScore = 2; budgetMatch = 'not specified';
  }

  // F. Buyer Intent in Preview Comments — 10 pts
  const buyerIntentCount = countBuyerIntentComments(item);
  const previewArr = item.latestComments || item.previewComments || item.comments;
  const hasPreview = Array.isArray(previewArr) && (previewArr as unknown[]).length > 0;
  let buyerIntentScore = 0;
  if (!hasPreview) {
    buyerIntentScore = 2; // no preview data — neutral
  } else if (buyerIntentCount >= 5) {
    buyerIntentScore = 10;
  } else if (buyerIntentCount >= 2) {
    buyerIntentScore = 6;
  } else if (buyerIntentCount >= 1) {
    buyerIntentScore = 3;
  }

  // G. Engagement Quality — 5 pts
  let engagementScore = 0;
  let engagementLevel = '';
  if (comments > 100 || likes > 1000) {
    engagementScore = 5; engagementLevel = 'high';
  } else if (comments > 20 || likes > 200) {
    engagementScore = 3; engagementLevel = 'moderate';
  } else {
    engagementScore = 1; engagementLevel = 'minimum';
  }

  if (cityScore === 0) rejectionReason = rejectionReason || 'wrong_city';

  const score = cityScore + microMarketScore + propertyTypeScore + bhkScore + budgetScore + buyerIntentScore + engagementScore;

  return {
    score,
    matchedCriteria: { city: cityMatch, microMarket: microMarketMatch, propertyType: propertyTypeMatch, bhk: bhkMatch, budget: budgetMatch, buyerIntentComments: buyerIntentCount, engagementLevel },
    scoreBreakdown: { city: cityScore, microMarket: microMarketScore, propertyType: propertyTypeScore, bhk: bhkScore, budget: budgetScore, buyerIntent: buyerIntentScore, engagement: engagementScore },
    rejectionReason,
  };
}

function buildReasonSelected(mc: MatchedCriteria, city: string, propertyType: string, bhkConfig?: string): string {
  const parts: string[] = [];
  if (mc.city) parts.push(city);
  if (mc.microMarket && mc.microMarket !== 'city-zone match') {
    parts.push(mc.microMarket.replace(/^exact: /, '').replace(/^nearby: /, 'near '));
  }
  if (mc.propertyType) parts.push(propertyType.toLowerCase());
  if (mc.bhk === 'exact match' && bhkConfig) parts.push(bhkConfig);
  if (mc.budget && mc.budget !== 'not specified' && mc.budget !== 'no price mentioned') parts.push(`budget ${mc.budget}`);
  if (mc.buyerIntentComments > 0) parts.push(`${mc.buyerIntentComments} buyer-intent comment${mc.buyerIntentComments !== 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(' · ') : 'Matched by relevance score';
}

function deriveMatchedConditions(mc: MatchedCriteria): string[] {
  const out: string[] = [];
  if (mc.city) out.push('city');
  if (mc.microMarket && mc.microMarket !== 'city-zone match') out.push('location');
  if (mc.propertyType) out.push('property_type');
  if (mc.bhk === 'exact match') out.push('bhk');
  if (mc.budget && mc.budget !== 'not specified' && mc.budget !== 'no price mentioned') out.push('budget');
  if (mc.buyerIntentComments >= 2) out.push('buyer_intent');
  return out;
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
  const bhkSlug = bhkConfig ? bhkConfig.toLowerCase().replace(/\s/g, '') : '';

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

  // BHK + city
  if (bhkSlug) {
    tags.add(`${bhkSlug}${citySlug}`);
    tags.add(`${citySlug}${bhkSlug}`);
    tags.add(`${bhkSlug}${propSlug}`);
    tags.add(`${bhkSlug}forsale`);
  }

  // Micro-market tags
  for (const market of microMarkets.slice(0, 5)) {
    const mSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '');
    tags.add(mSlug);
    tags.add(`${mSlug}${propSlug}`);
    tags.add(`${citySlug}${mSlug}`);
    tags.add(`${mSlug}realestate`);
    tags.add(`${mSlug}property`);
    if (bhkSlug) {
      tags.add(`${bhkSlug}${mSlug}`);
      tags.add(`${mSlug}${bhkSlug}`);
    }
  }

  // Nearby area tags
  const nearbyAreas = getNearbyAreas(microMarkets);
  for (const area of nearbyAreas.slice(0, 6)) {
    const aSlug = area.toLowerCase().replace(/[^a-z0-9]/g, '');
    tags.add(aSlug);
    if (bhkSlug) tags.add(`${bhkSlug}${aSlug}`);
  }

  // General intent
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

  return {
    hashtags: Array.from(tags).filter(Boolean).slice(0, 30),
    nearbyAreas: nearbyAreas.slice(0, 8),
  };
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

async function waitForApifyRun(runId: string, apiKey: string, maxWaitMs = 180000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
    const data = await res.json();
    const status = data.data?.status;
    if (status === 'SUCCEEDED') return data.data.defaultDatasetId;
    if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Apify run ${status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Apify run timed out after 3 minutes');
}

async function fetchApifyDataset(datasetId: string, apiKey: string): Promise<unknown[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&clean=true&format=json`
  );
  return res.json();
}

// ─── Comment Extraction (unchanged) ───────────────────────────────────────────
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

  const runId = await runApifyActor(commentActorId, input, apiKey);
  const datasetId = await waitForApifyRun(runId, apiKey);
  const items = await fetchApifyDataset(datasetId, apiKey) as Record<string, unknown>[];

  const seen = new Set<string>();
  const commenters: Commenter[] = [];

  for (const item of items) {
    const username = (
      item.ownerUsername || item.username || item.authorUsername
    ) as string | undefined;
    if (!username || seen.has(username)) continue;
    seen.add(username);

    const text = (item.text || item.comment || '') as string;
    const sc = item.postShortCode as string | undefined;
    commenters.push({
      username,
      comment: text,
      postUrl: (item.postUrl as string) || (item.url as string) || (sc ? `https://www.instagram.com/p/${sc}/` : ''),
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
      city = '',
      microMarkets = [],
      budgetMin = 0,
      budgetMax = 0,
      propertyType = 'Apartment',
      bhkConfig,
      customHashtags = [],
      manualPostUrls = [],
      resultsLimit = 100,
    } = body;

    const apifyKey = await getApiKey('apify');
    if (!apifyKey) {
      return NextResponse.json(
        { error: 'Apify API Key not configured. Please add it in IntentRadar Settings.' },
        { status: 400 }
      );
    }

    const commentActorId = normalizeActorId(await getSetting('actor_instagram_comments'));

    // ── MODE A: Manual URLs — skip post finding entirely ──────────────────────
    const manualUrls = [...new Set((manualPostUrls as string[]).filter(Boolean))].slice(0, 10);

    if (manualUrls.length > 0) {
      const commenters = await extractCommenters(manualUrls, resultsLimit, commentActorId, apifyKey);
      return NextResponse.json({
        commenters,
        totalFound: commenters.length,
        postsScraped: manualUrls.length,
        topPosts: manualUrls.map(url => ({
          url, commentsCount: 0, score: 0, caption: 'Manual URL',
          matchedConditions: ['manual'],
          matchedCriteria: null,
          reasonSelected: 'Manual URL — criteria not applied',
        })),
        hashtags: [],
        nearbyAreas: [],
        mode: 'manual',
      });
    }

    // ── MODE B: Hashtag search → weighted scoring → extract commenters ─────────
    if (!city.trim()) {
      return NextResponse.json(
        { error: 'City is required when no post URLs are provided.' },
        { status: 400 }
      );
    }

    // Step 1: Generate hashtags (includes nearby areas)
    const { hashtags, nearbyAreas } = generateSearchHashtags({
      city, microMarkets, propertyType, bhkConfig, customHashtags,
    });
    const hashtagUrls = hashtags.map(tag => `https://www.instagram.com/explore/tags/${tag}/`);

    const postRunId = await runApifyActor(
      'apify~instagram-scraper',
      { directUrls: hashtagUrls, resultsType: 'posts', resultsLimit: 50 },
      apifyKey
    );

    const postDatasetId = await waitForApifyRun(postRunId, apifyKey);
    const postItems = await fetchApifyDataset(postDatasetId, apifyKey) as Record<string, unknown>[];

    // Step 2: Hard filters + weighted scoring
    const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
    const debug: DebugSummary = {
      totalScanned: postItems.length,
      eligibleAfterAgeFilter: 0,
      eligibleAfterEngagementFilter: 0,
      selectedPosts: 0,
      rejectedReasons: {},
    };

    const bump = (key: string) => { debug.rejectedReasons[key] = (debug.rejectedReasons[key] || 0) + 1; };

    const scoredPosts: ScoredPost[] = [];

    for (const item of postItems) {
      if (!item.url) continue;

      // Hard filter: age
      const ts = (item.timestamp as string) || '';
      if (ts && Date.now() - new Date(ts).getTime() > THREE_MONTHS_MS) {
        bump('older_than_90_days'); continue;
      }
      debug.eligibleAfterAgeFilter++;

      // Hard filter: engagement
      const commentsCount = Number(item.commentsCount ?? item.commentCount ?? 0);
      if (commentsCount <= 5) { bump('low_comment_count'); continue; }
      debug.eligibleAfterEngagementFilter++;

      // Weighted scoring
      const { score, matchedCriteria, scoreBreakdown, rejectionReason } = scorePost(
        item, city, microMarkets, propertyType, bhkConfig, Number(budgetMin), Number(budgetMax)
      );

      if (score < 40) {
        bump(rejectionReason || 'weak_relevance_score'); continue;
      }

      scoredPosts.push({
        url: item.url as string,
        commentsCount,
        score,
        caption: ((item.caption as string) || '').slice(0, 120),
        timestamp: ts || new Date().toISOString(),
        matchedCriteria,
        scoreBreakdown,
        reasonSelected: buildReasonSelected(matchedCriteria, city, propertyType, bhkConfig),
        rejectionReason,
      });
    }

    // Step 3: Primary selection (≥55), fallback (≥40 if not enough)
    const primary = scoredPosts.filter(p => p.score >= 55);
    const selected = primary.length >= 5 ? primary : scoredPosts.filter(p => p.score >= 40);

    // Sort: score desc → buyerIntentComments desc → recency desc
    selected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchedCriteria.buyerIntentComments !== a.matchedCriteria.buyerIntentComments) {
        return b.matchedCriteria.buyerIntentComments - a.matchedCriteria.buyerIntentComments;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const topPosts = selected.slice(0, 20);
    debug.selectedPosts = topPosts.length;

    // Track weak_relevance_score for posts that didn't make final cut
    for (const p of scoredPosts) {
      if (!topPosts.includes(p)) bump('weak_relevance_score');
    }

    if (topPosts.length === 0) {
      return NextResponse.json({
        error: `No posts found matching your criteria (city: ${city}, property: ${propertyType}${bhkConfig ? `, ${bhkConfig}` : ''}). ` +
          `Try adding more micro-markets, a broader property type, or paste specific post URLs directly.`,
        hashtags,
        nearbyAreas,
        debugSummary: debug,
        mode: 'hashtag',
      }, { status: 400 });
    }

    // Step 4: Extract commenters (unchanged)
    const postUrls = topPosts.map(p => p.url);
    const commenters = await extractCommenters(postUrls, resultsLimit, commentActorId, apifyKey);

    return NextResponse.json({
      commenters,
      totalFound: commenters.length,
      postsScraped: topPosts.length,
      topPosts: topPosts.slice(0, 10).map(p => ({
        url: p.url,
        commentsCount: p.commentsCount,
        score: p.score,
        caption: p.caption,
        matchedConditions: deriveMatchedConditions(p.matchedCriteria),
        matchedCriteria: p.matchedCriteria,
        scoreBreakdown: p.scoreBreakdown,
        reasonSelected: p.reasonSelected,
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
