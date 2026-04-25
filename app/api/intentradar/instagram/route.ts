// app/api/intentradar/instagram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiKey, getSetting } from '@/lib/intentradar/db';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Commenter {
  username: string;
  comment: string;
  postUrl: string;
  timestamp: string;
}

interface EligiblePost {
  url: string;
  commentsCount: number;
  score: number;
  caption: string;
  timestamp: string;
  matchedConditions: string[];
}

// ─── Hashtag Generator (unified — for post finding) ──────────────────────────
export function generateSearchHashtags(inputs: {
  city: string;
  microMarkets: string[];
  propertyType: string;
  bhkConfig?: string;
  customHashtags?: string[];
}): string[] {
  const { city, microMarkets, propertyType, bhkConfig, customHashtags } = inputs;
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '');
  const propSlug = propertyType.toLowerCase().replace(/[^a-z]/g, '');

  const tags = new Set<string>();

  // City-level (broadest — captures posts in and around the city)
  tags.add(`${citySlug}realestate`);
  tags.add(`${citySlug}${propSlug}`);
  tags.add(`${citySlug}properties`);
  tags.add(`${citySlug}flats`);
  tags.add(`${citySlug}homes`);
  tags.add(`new${propSlug}${citySlug}`);

  // Micro-market specific (highest precision)
  for (const market of microMarkets.slice(0, 5)) {
    const mSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '');
    tags.add(mSlug);
    tags.add(`${mSlug}${propSlug}`);
    tags.add(`${citySlug}${mSlug}`);
    if (bhkConfig) {
      const bhkSlug = bhkConfig.toLowerCase().replace(/\s/g, '');
      tags.add(`${bhkSlug}${mSlug}`);
    }
  }

  // BHK + city / property
  if (bhkConfig) {
    const bhkSlug = bhkConfig.toLowerCase().replace(/\s/g, '');
    tags.add(`${bhkSlug}${citySlug}`);
    tags.add(`${bhkSlug}${propSlug}`);
    tags.add(`${bhkSlug}forsale`);
  }

  // General real estate intent (brings in engaged audience)
  tags.add(`${propSlug}forsale`);
  tags.add('indianrealestate');
  tags.add('readytomovein');
  tags.add('reraapproved');

  if (customHashtags) {
    for (const tag of customHashtags) {
      tags.add(tag.replace(/^#/, '').replace(/\s/g, '').toLowerCase());
    }
  }

  return Array.from(tags).filter(Boolean).slice(0, 22);
}

// ─── Post Relevance Scoring ───────────────────────────────────────────────────
// Rules: city is MANDATORY. At least 2 total conditions must match.
// Budget extended ±30% to account for negotiation range.
// Posts older than 3 months or with ≤5 comments are excluded.

const PROP_KEYWORDS: Record<string, string[]> = {
  Apartment: ['apartment', 'flat', 'flats', 'unit', 'residential'],
  Villa:     ['villa', 'independent house', 'bungalow', 'independent home'],
  Plot:      ['plot', 'land', 'site', 'bda plot'],
  Penthouse: ['penthouse', 'duplex', 'luxury flat'],
  'Row House':['row house', 'rowhouse', 'townhouse'],
  Commercial: ['commercial', 'office', 'shop', 'showroom', 'retail'],
};

function getPropKeywords(propertyType: string): string[] {
  return PROP_KEYWORDS[propertyType] ?? [propertyType.toLowerCase()];
}

function getBHKKeywords(bhkConfig: string): string[] {
  const num = bhkConfig.match(/\d+/)?.[0] ?? '';
  return [`${num}bhk`, `${num} bhk`, `${num}-bhk`, `${num} bedroom`, `${num}bedroom`].filter(Boolean);
}

function matchesBudget(text: string, budgetMin: number, budgetMax: number): boolean {
  if (!budgetMin || !budgetMax) return false;
  // Extend range ±30% to match user expectation (60-80L → 42-104L)
  const extMin = budgetMin * 0.7;
  const extMax = budgetMax * 1.5;

  // Match patterns: "60 lakhs", "60L", "60 lakh", "1.2 cr", "1.2 crore"
  const lakhPattern = /(\d+(?:\.\d+)?)\s*(?:l(?:akh)?s?|lacs?)\b/gi;
  const crorePattern = /(\d+(?:\.\d+)?)\s*(?:cr(?:ore)?s?)\b/gi;

  let m: RegExpExecArray | null;
  while ((m = lakhPattern.exec(text)) !== null) {
    const val = parseFloat(m[1]);
    if (val >= extMin && val <= extMax) return true;
  }
  while ((m = crorePattern.exec(text)) !== null) {
    const val = parseFloat(m[1]) * 100;
    if (val >= extMin && val <= extMax) return true;
  }
  return false;
}

function scorePostRelevance(
  item: Record<string, unknown>,
  city: string,
  microMarkets: string[],
  propertyType: string,
  bhkConfig: string | undefined,
  budgetMin: number,
  budgetMax: number,
): { eligible: boolean; score: number; matchedConditions: string[] } {
  const caption = ((item.caption as string) || '').toLowerCase();
  const hashtagsArr = ((item.hashtags as string[]) || []).map(h => h.toLowerCase());
  const fullText = `${caption} ${hashtagsArr.join(' ')}`;

  const cityLower = city.toLowerCase();
  const citySlug = cityLower.replace(/[^a-z0-9]/g, '');
  const matched: string[] = [];

  // 1. City (MANDATORY)
  if (fullText.includes(cityLower) || fullText.includes(citySlug)) {
    matched.push('city');
  }

  // 2. Location — any micro-market OR nearby (broader city-area match)
  const locationMatch = microMarkets.some(m => {
    const ml = m.toLowerCase();
    return fullText.includes(ml) || fullText.includes(ml.replace(/\s/g, ''));
  });
  if (locationMatch) matched.push('location');

  // 3. Property type
  if (getPropKeywords(propertyType).some(kw => fullText.includes(kw))) {
    matched.push('property_type');
  }

  // 4. BHK configuration
  if (bhkConfig && getBHKKeywords(bhkConfig).some(kw => fullText.includes(kw))) {
    matched.push('bhk');
  }

  // 5. Budget range (extended)
  if (matchesBudget(fullText, budgetMin, budgetMax)) matched.push('budget');

  // Eligibility: city mandatory + at least 1 more = 2 total conditions
  const eligible = matched.includes('city') && matched.length >= 2;

  // Engagement × recency × condition multiplier
  const comments = Number(item.commentsCount ?? item.commentCount ?? 0);
  const ts = item.timestamp as string | undefined;
  const ageH = ts ? (Date.now() - new Date(ts).getTime()) / 3_600_000 : Infinity;
  const recency = ageH < 24 ? 1.0 : ageH < 72 ? 0.85 : ageH < 168 ? 0.65 : ageH < 720 ? 0.40 : 0.15;
  const score = comments * recency * matched.length;

  return { eligible, score, matchedConditions: matched };
}

// ─── Apify Helpers ────────────────────────────────────────────────────────────
function normalizeActorId(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  // Convert slash format to tilde; reject if no tilde after normalizing
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

// ─── Comment Extraction ───────────────────────────────────────────────────────
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

// ─── POST Handler ─────────────────────────────────────────────────────────────
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
          url, commentsCount: 0, score: 0, caption: 'Manual URL', matchedConditions: ['manual'],
        })),
        hashtags: [],
        mode: 'manual',
      });
    }

    // ── MODE B: Hashtag search → filter → score → extract commenters ──────────
    if (!city.trim()) {
      return NextResponse.json(
        { error: 'City is required when no post URLs are provided.' },
        { status: 400 }
      );
    }

    // Step 1: Find posts via hashtags
    const hashtags = generateSearchHashtags({
      city, microMarkets, propertyType, bhkConfig, customHashtags,
    });
    const hashtagUrls = hashtags.map(tag => `https://www.instagram.com/explore/tags/${tag}/`);

    const postRunId = await runApifyActor(
      'apify~instagram-scraper',
      {
        directUrls: hashtagUrls,
        resultsType: 'posts',
        resultsLimit: 30, // fetch more, then filter down to relevant ones
      },
      apifyKey
    );

    const postDatasetId = await waitForApifyRun(postRunId, apifyKey);
    const postItems = await fetchApifyDataset(postDatasetId, apifyKey) as Record<string, unknown>[];

    // Step 2: Filter by age (≤90 days) and engagement (>5 comments), then score by relevance
    const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
    const eligiblePosts: EligiblePost[] = [];

    for (const item of postItems) {
      if (!item.url) continue;

      const commentsCount = Number(item.commentsCount ?? item.commentCount ?? 0);
      if (commentsCount <= 5) continue; // must have meaningful engagement

      const ts = (item.timestamp as string) || '';
      if (ts && Date.now() - new Date(ts).getTime() > THREE_MONTHS_MS) continue; // too old

      const { eligible, score, matchedConditions } = scorePostRelevance(
        item, city, microMarkets, propertyType, bhkConfig, Number(budgetMin), Number(budgetMax)
      );

      if (!eligible) continue;

      eligiblePosts.push({
        url: item.url as string,
        commentsCount,
        score,
        caption: ((item.caption as string) || '').slice(0, 120),
        timestamp: ts || new Date().toISOString(),
        matchedConditions,
      });
    }

    // Step 3: Sort by score (engagement × recency × conditions matched), take top 20
    eligiblePosts.sort((a, b) => b.score - a.score);
    const topPosts = eligiblePosts.slice(0, 20);

    if (topPosts.length === 0) {
      return NextResponse.json({
        error: `No posts found matching your criteria (city: ${city}, property: ${propertyType}${bhkConfig ? `, ${bhkConfig}` : ''}). ` +
               `Try adding more micro-markets, broader property type, or paste specific post URLs directly.`,
        hashtags,
        mode: 'hashtag',
      }, { status: 400 });
    }

    // Step 4: Extract commenters from qualifying posts
    const postUrls = topPosts.map(p => p.url);
    const commenters = await extractCommenters(postUrls, resultsLimit, commentActorId, apifyKey);

    return NextResponse.json({
      commenters,
      totalFound: commenters.length,
      postsScraped: topPosts.length,
      topPosts: topPosts.slice(0, 10).map(p => ({
        url: p.url,
        commentsCount: p.commentsCount,
        score: Math.round(p.score),
        caption: p.caption,
        matchedConditions: p.matchedConditions,
      })),
      hashtags,
      mode: 'hashtag',
      eligibleFound: eligiblePosts.length,
      totalScanned: postItems.length,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Mining failed';
    console.error('Instagram miner error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
