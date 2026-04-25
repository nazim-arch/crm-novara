// app/api/intentradar/instagram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiKey } from '@/lib/intentradar/db';

// ─── Types ───────────────────────────────────────────────────────────────────
interface InstagramResult {
  username: string;
  interaction: string;
  interactionType: 'comment' | 'post_owner';
  postUrl: string;
  postCaption: string;
  hashtag: string;
  timestamp: string;
}

// ─── Hashtag Generator ───────────────────────────────────────────────────────
// Returns two pools:
//   listingTags — agents post these; good for mining comments from buyers
//   buyerTags   — buyers post these; captures direct buying-intent signals
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

  // ── Listing tags (agents post these — comment sections have buyers) ──────
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
    if (budgetMin < 100) {
      listing.add('affordablehousing');
      listing.add(`under${Math.round(budgetMax)}lakhs`);
    } else {
      listing.add('luxuryproperties');
      listing.add('premiumhomes');
    }
  }

  // ── Buyer-intent tags (buyers post these — direct buying signals) ────────
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

  // ── Custom tags go into both pools ───────────────────────────────────────
  if (customHashtags) {
    for (const tag of customHashtags) {
      const slug = tag.replace(/^#/, '').replace(/\s/g, '').toLowerCase();
      listing.add(slug);
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
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Apify actor start failed: ${err}`);
  }
  const data = await response.json();
  return data.data.id;
}

async function waitForApifyRun(runId: string, apiKey: string, maxWaitMs = 120000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
    const data = await res.json();
    const status = data.data?.status;
    if (status === 'SUCCEEDED') return data.data.defaultDatasetId;
    if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Apify run ${status}`);
    await new Promise(r => setTimeout(r, 4000));
  }
  throw new Error('Apify run timed out');
}

async function fetchApifyDataset(datasetId: string, apiKey: string): Promise<unknown[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&clean=true&format=json`
  );
  return res.json();
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

    const { listingTags, buyerTags, all: allHashtags } = generateHashtags({
      city, microMarkets, budgetMin, budgetMax, propertyType, bhkConfig, customHashtags,
    });

    const allResults: InstagramResult[] = [];

    // ── Step 1a: Scrape listing-hashtag posts — mine their comments for buyers
    const listingHashtagUrls = listingTags.map(tag => `https://www.instagram.com/explore/tags/${tag}/`);

    const listingRunId = await runApifyActor(
      'apify~instagram-scraper',
      {
        directUrls: listingHashtagUrls,
        resultsType: 'posts',
        resultsLimit: Math.min(Math.max(5, Math.ceil(resultsLimit / listingTags.length)), 15),
      },
      apifyKey
    );

    const listingDatasetId = await waitForApifyRun(listingRunId, apifyKey);
    const listingItems = await fetchApifyDataset(listingDatasetId, apifyKey) as Record<string, unknown>[];

    // Collect post URLs to mine comments from
    const postUrls: string[] = [...manualPostUrls];

    for (const item of listingItems) {
      if (item.url) postUrls.push(item.url as string);
    }

    // ── Step 1b: Scrape buyer-intent hashtag posts — these ARE the buyers ─────
    const buyerHashtagUrls = buyerTags.map(tag => `https://www.instagram.com/explore/tags/${tag}/`);

    const buyerRunId = await runApifyActor(
      'apify~instagram-scraper',
      {
        directUrls: buyerHashtagUrls,
        resultsType: 'posts',
        resultsLimit: Math.min(Math.max(5, Math.ceil(resultsLimit / buyerTags.length)), 15),
      },
      apifyKey
    );

    const buyerDatasetId = await waitForApifyRun(buyerRunId, apifyKey);
    const buyerItems = await fetchApifyDataset(buyerDatasetId, apifyKey) as Record<string, unknown>[];

    // Buyer-intent posts: the poster is the potential buyer
    for (const item of buyerItems) {
      const username = (item.ownerUsername || item.username || item.authorUsername) as string | undefined;
      if (username && item.url) {
        const caption = (item.caption as string) || '';
        allResults.push({
          username,
          interaction: caption
            ? `🔍 Buyer post: "${caption.slice(0, 100)}${caption.length > 100 ? '...' : ''}"`
            : '🔍 Posted buyer-intent content',
          interactionType: 'post_owner',
          postUrl: item.url as string,
          postCaption: caption,
          hashtag: 'buyer-intent',
          timestamp: (item.timestamp as string) || new Date().toISOString(),
        });
      }
    }

    // ── Step 2: Scrape comments from listing posts — buyers ask questions here ─
    const urlsToScrape = [...new Set(postUrls)].slice(0, 20);

    if (urlsToScrape.length > 0) {
      const commentRunId = await runApifyActor(
        'apify~instagram-scraper',
        {
          directUrls: urlsToScrape,
          resultsType: 'comments',
          resultsLimit: Math.max(10, Math.ceil(resultsLimit / urlsToScrape.length)),
        },
        apifyKey
      );

      const commentDatasetId = await waitForApifyRun(commentRunId, apifyKey);
      const commentItems = await fetchApifyDataset(commentDatasetId, apifyKey) as Record<string, unknown>[];

      for (const comment of commentItems) {
        // Apify comment items may use ownerUsername, username, or authorUsername
        const username = (comment.ownerUsername || comment.username || comment.authorUsername) as string | undefined;
        if (username) {
          const text = (comment.text || comment.comment || '') as string;
          allResults.push({
            username,
            interaction: text ? `💬 Commented: "${text.slice(0, 120)}${text.length > 120 ? '...' : ''}"` : '💬 Commented',
            interactionType: 'comment',
            postUrl: (comment.postUrl || comment.url || comment.postShortCode
              ? `https://www.instagram.com/p/${comment.postShortCode}/`
              : '') as string,
            postCaption: '',
            hashtag: 'listing-comment',
            timestamp: (comment.timestamp as string) || new Date().toISOString(),
          });
        }
      }
    }

    // ── Deduplicate (comments > buyer posts > listing posts) ─────────────────
    const priority = (r: InstagramResult) =>
      r.interactionType === 'comment' ? 0 : r.hashtag === 'buyer-intent' ? 1 : 2;

    const deduped = new Map<string, InstagramResult>();
    for (const r of allResults) {
      const existing = deduped.get(r.username);
      if (!existing || priority(r) < priority(existing)) {
        deduped.set(r.username, r);
      }
    }

    const finalResults = Array.from(deduped.values())
      .sort((a, b) => {
        const pa = priority(a), pb = priority(b);
        if (pa !== pb) return pa - pb;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, resultsLimit);

    return NextResponse.json({
      results: finalResults,
      hashtags: allHashtags,
      listingTags,
      buyerTags,
      totalFound: finalResults.length,
      postsScraped: urlsToScrape.length,
      commentCount: finalResults.filter(r => r.interactionType === 'comment').length,
      buyerPostCount: finalResults.filter(r => r.hashtag === 'buyer-intent').length,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Mining failed';
    console.error('Instagram miner error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
