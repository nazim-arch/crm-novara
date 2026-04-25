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

interface ScoredPost {
  url: string;
  commentsCount: number;
  score: number;
  caption: string;
  timestamp: string;
}

// ─── Hashtag Generator ───────────────────────────────────────────────────────
export function generateHashtags(inputs: {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  customHashtags?: string[];
}): { listingTags: string[]; buyerTags: string[]; all: string[] } {
  const { city, microMarkets, budgetMin, budgetMax, propertyType, bhkConfig, customHashtags } = inputs;
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '');
  const propSlug = propertyType.toLowerCase().replace(/[^a-z]/g, '');

  const listing = new Set<string>();
  const buyer = new Set<string>();

  listing.add(`${citySlug}realestate`);
  listing.add(`${citySlug}properties`);
  listing.add(`${citySlug}flats`);
  listing.add(`${citySlug}homes`);
  listing.add(`${citySlug}${propSlug}`);
  listing.add('indianrealestate');
  listing.add('readytomovein');
  listing.add(`newlaunch${citySlug}`);
  listing.add('reraapproved');

  for (const market of microMarkets.slice(0, 4)) {
    const mSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '');
    listing.add(`${mSlug}${propSlug}`);
    listing.add(`${citySlug}${mSlug}`);
  }

  if (bhkConfig) {
    const bhkSlug = bhkConfig.toLowerCase().replace(/\s/g, '');
    listing.add(`${bhkSlug}${citySlug}`);
    listing.add(`${bhkSlug}forsale`);
  }

  if (budgetMin && budgetMax) {
    listing.add(budgetMin < 100 ? 'affordablehousing' : 'luxuryproperties');
    listing.add(budgetMin < 100 ? `under${Math.round(budgetMax)}lakhs` : 'premiumhomes');
  }

  buyer.add('homehunting');
  buyer.add('househunting');
  buyer.add('lookingforhome');
  buyer.add('propertysearch');
  buyer.add('dreamhomesearch');
  buyer.add('firsthomebuyer');
  buyer.add('newhomesearch');
  buyer.add(`lookingfor${citySlug}home`);
  buyer.add(`wanttobuy${citySlug}`);
  buyer.add(`${citySlug}homesearch`);
  buyer.add(`${citySlug}propertysearch`);
  buyer.add('homeshopping');
  buyer.add('buyingahome');
  buyer.add(`${citySlug}firsthome`);

  if (bhkConfig) {
    const bhkSlug = bhkConfig.toLowerCase().replace(/\s/g, '');
    buyer.add(`looking${bhkSlug}${citySlug}`);
  }

  if (customHashtags) {
    for (const tag of customHashtags) {
      listing.add(tag.replace(/^#/, '').replace(/\s/g, '').toLowerCase());
    }
  }

  const listingTags = Array.from(listing).filter(Boolean).slice(0, 12);
  const buyerTags = Array.from(buyer).filter(Boolean).slice(0, 12);
  const all = [...new Set([...listingTags, ...buyerTags])];

  return { listingTags, buyerTags, all };
}

// ─── Apify Helpers ────────────────────────────────────────────────────────────
async function runApifyActor(actorId: string, input: object, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Apify actor start failed: ${err}`);
  }
  return (await response.json()).data.id;
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
  throw new Error('Apify run timed out');
}

async function fetchApifyDataset(datasetId: string, apiKey: string): Promise<unknown[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&clean=true&format=json`
  );
  return res.json();
}

// ─── Post Scoring ─────────────────────────────────────────────────────────────
// Highest-comment + most-recent posts get picked first for comment mining.
function scorePost(item: Record<string, unknown>): number {
  const comments = Number(item.commentsCount ?? item.commentCount ?? 0);
  const ts = item.timestamp as string | undefined;
  const ageHours = ts ? (Date.now() - new Date(ts).getTime()) / 3_600_000 : Infinity;

  const recency =
    ageHours < 24  ? 1.00 :
    ageHours < 72  ? 0.85 :
    ageHours < 168 ? 0.65 :
    ageHours < 720 ? 0.40 :
                     0.15;

  return comments * recency * (comments > 10 ? 1.2 : 1.0);
}

// ─── POST Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      city,
      microMarkets = [],
      budgetMin = 50,
      budgetMax = 80,
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

    const commentActorId = (await getSetting('actor_instagram_comments'))?.trim()
      || 'apify~instagram-scraper';
    const isStandardScraper = commentActorId === 'apify~instagram-scraper';

    // ── Step 1: Find high-comment recent posts via hashtags ───────────────────
    const scoredPosts: ScoredPost[] = [];
    const { listingTags, buyerTags, all: allHashtags } = city?.trim()
      ? generateHashtags({ city, microMarkets, budgetMin, budgetMax, propertyType, bhkConfig, customHashtags })
      : { listingTags: [], buyerTags: [], all: [] };

    if (allHashtags.length > 0) {
      const hashtagUrls = allHashtags.map(tag => `https://www.instagram.com/explore/tags/${tag}/`);

      const postRunId = await runApifyActor(
        'apify~instagram-scraper',
        {
          directUrls: hashtagUrls,
          resultsType: 'posts',
          resultsLimit: Math.min(Math.ceil(resultsLimit / allHashtags.length) + 5, 20),
        },
        apifyKey
      );

      const postDatasetId = await waitForApifyRun(postRunId, apifyKey);
      const postItems = await fetchApifyDataset(postDatasetId, apifyKey) as Record<string, unknown>[];

      for (const item of postItems) {
        if (!item.url) continue;
        scoredPosts.push({
          url: item.url as string,
          commentsCount: Number(item.commentsCount ?? item.commentCount ?? 0),
          score: scorePost(item),
          caption: ((item.caption as string) || '').slice(0, 80),
          timestamp: (item.timestamp as string) || new Date().toISOString(),
        });
      }

      // Sort: highest score (commentsCount × recency) first
      scoredPosts.sort((a, b) => b.score - a.score);
    }

    // ── Step 2: Build final list of post URLs to mine comments from ───────────
    // Manual URLs come first (user-specified high-value targets), then top scored hashtag posts
    const manualUrls = [...new Set(manualPostUrls as string[])].slice(0, 10);
    const hashtagTopUrls = scoredPosts.map(p => p.url).slice(0, 20 - manualUrls.length);
    const postUrlsToMine = [...new Set([...manualUrls, ...hashtagTopUrls])];

    if (postUrlsToMine.length === 0) {
      return NextResponse.json({ error: 'No posts found to mine. Try different hashtags or paste post URLs directly.' }, { status: 400 });
    }

    // ── Step 3: Extract commenters from those posts ───────────────────────────
    const perPostLimit = Math.min(Math.ceil(resultsLimit / postUrlsToMine.length) + 20, 500);

    const commentInput = isStandardScraper
      ? { directUrls: postUrlsToMine, resultsType: 'comments', resultsLimit: perPostLimit }
      : { directUrls: postUrlsToMine, postUrls: postUrlsToMine, resultsLimit: perPostLimit };

    const commentRunId = await runApifyActor(commentActorId, commentInput, apifyKey);
    const commentDatasetId = await waitForApifyRun(commentRunId, apifyKey);
    const commentItems = await fetchApifyDataset(commentDatasetId, apifyKey) as Record<string, unknown>[];

    // ── Step 4: Parse commenters — deduplicate, return only unique usernames ──
    const seen = new Set<string>();
    const commenters: Commenter[] = [];

    for (const item of commentItems) {
      const username = (item.ownerUsername || item.username || item.authorUsername) as string | undefined;
      if (!username || seen.has(username)) continue;
      seen.add(username);

      const text = (item.text || item.comment || '') as string;
      const shortCode = item.postShortCode as string | undefined;
      commenters.push({
        username,
        comment: text,
        postUrl: (item.postUrl as string) || (item.url as string) || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : ''),
        timestamp: (item.timestamp as string) || new Date().toISOString(),
      });
    }

    const finalCommenters = commenters.slice(0, resultsLimit);

    return NextResponse.json({
      commenters: finalCommenters,
      totalFound: finalCommenters.length,
      postsScraped: postUrlsToMine.length,
      topPosts: scoredPosts.slice(0, 10).map(p => ({
        url: p.url,
        commentsCount: p.commentsCount,
        score: Math.round(p.score),
        caption: p.caption,
      })),
      hashtags: allHashtags,
      listingTags,
      buyerTags,
      commentActorId,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Mining failed';
    console.error('Instagram miner error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
