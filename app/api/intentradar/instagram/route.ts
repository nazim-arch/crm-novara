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
function generateHashtags(inputs: {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  customHashtags?: string[];
}): string[] {
  const { city, microMarkets, budgetMin, budgetMax, propertyType, bhkConfig, customHashtags } = inputs;
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '');
  const propSlug = propertyType.toLowerCase().replace(/[^a-z]/g, '');

  const hashtags = new Set<string>();

  hashtags.add(`${citySlug}realestate`);
  hashtags.add(`${citySlug}properties`);
  hashtags.add(`${citySlug}flats`);
  hashtags.add(`${citySlug}homes`);
  hashtags.add(`${citySlug}${propSlug}`);

  for (const market of microMarkets.slice(0, 5)) {
    const mSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '');
    hashtags.add(mSlug);
    hashtags.add(`${mSlug}${propSlug}`);
    hashtags.add(`${citySlug}${mSlug}`);
  }

  if (bhkConfig) {
    const bhkSlug = bhkConfig.toLowerCase().replace(/\s/g, '');
    hashtags.add(`${bhkSlug}${citySlug}`);
    hashtags.add(`${bhkSlug}forsale`);
    hashtags.add(`${bhkSlug}apartment`);
  }

  if (budgetMin && budgetMax) {
    hashtags.add('budgethomes');
    hashtags.add('affordablehousing');
    if (budgetMin < 100) {
      hashtags.add(`under${Math.round(budgetMax)}lakhs`);
    } else {
      hashtags.add('luxuryproperties');
      hashtags.add('premiumhomes');
    }
  }

  hashtags.add('indianrealestate');
  hashtags.add('readytomovein');
  hashtags.add(`newlaunch${citySlug}`);
  hashtags.add('homesearch');
  hashtags.add('propertyinvesting');
  hashtags.add('reraapproved');

  if (customHashtags) {
    for (const tag of customHashtags) {
      hashtags.add(tag.replace(/^#/, '').replace(/\s/g, '').toLowerCase());
    }
  }

  return Array.from(hashtags).filter(Boolean).slice(0, 15);
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

    const hashtags = generateHashtags({ city, microMarkets, budgetMin, budgetMax, propertyType, bhkConfig, customHashtags });

    const allResults: InstagramResult[] = [];

    // ── Step 1: Scrape posts via hashtag URLs (apify/instagram-scraper) ───────
    // Build Instagram hashtag explore URLs — actor accepts these as directUrls
    const hashtagUrls = hashtags.map(tag => `https://www.instagram.com/explore/tags/${tag}/`);
    const postsPerHashtag = Math.max(5, Math.ceil(resultsLimit / hashtags.length));

    const hashtagRunId = await runApifyActor(
      'apify~instagram-scraper',
      {
        directUrls: hashtagUrls,
        resultsType: 'posts',
        resultsLimit: Math.min(postsPerHashtag, 20),
      },
      apifyKey
    );

    const hashtagDatasetId = await waitForApifyRun(hashtagRunId, apifyKey);
    const hashtagItems = await fetchApifyDataset(hashtagDatasetId, apifyKey) as Record<string, unknown>[];

    // Collect post URLs + capture post owners as signals
    const postUrls: string[] = [...manualPostUrls];

    for (const item of hashtagItems) {
      if (item.url) postUrls.push(item.url as string);

      if (item.ownerUsername && item.url) {
        const caption = (item.caption as string) || '';
        allResults.push({
          username: item.ownerUsername as string,
          interaction: caption
            ? `📸 Posted: "${caption.slice(0, 80)}${caption.length > 80 ? '...' : ''}"`
            : '📸 Posted this',
          interactionType: 'post_owner',
          postUrl: item.url as string,
          postCaption: caption,
          hashtag: '', // derived from explore URL, not returned directly
          timestamp: (item.timestamp as string) || new Date().toISOString(),
        });
      }
    }

    // ── Step 2: Scrape comments from collected post URLs ──────────────────────
    const urlsToScrape = [...new Set(postUrls)].slice(0, 20);

    if (urlsToScrape.length > 0) {
      const commentRunId = await runApifyActor(
        'apify~instagram-scraper',
        {
          directUrls: urlsToScrape,
          resultsType: 'comments',
          resultsLimit: Math.ceil(resultsLimit / urlsToScrape.length),
        },
        apifyKey
      );

      const commentDatasetId = await waitForApifyRun(commentRunId, apifyKey);
      const commentItems = await fetchApifyDataset(commentDatasetId, apifyKey) as Record<string, unknown>[];

      for (const comment of commentItems) {
        if (comment.ownerUsername) {
          allResults.push({
            username: comment.ownerUsername as string,
            interaction: (comment.text as string) || '💬 Commented',
            interactionType: 'comment',
            postUrl: (comment.postUrl as string) || (comment.url as string) || '',
            postCaption: '',
            hashtag: '',
            timestamp: (comment.timestamp as string) || new Date().toISOString(),
          });
        }
      }
    }

    // ── Deduplicate (prefer comment over post_owner) ──────────────────────────
    const deduped = new Map<string, InstagramResult>();
    for (const r of allResults) {
      const existing = deduped.get(r.username);
      if (!existing) {
        deduped.set(r.username, r);
      } else if (r.interactionType === 'comment' && existing.interactionType !== 'comment') {
        deduped.set(r.username, r);
      }
    }

    const finalResults = Array.from(deduped.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, resultsLimit);

    return NextResponse.json({
      results: finalResults,
      hashtags,
      totalFound: finalResults.length,
      postsScraped: urlsToScrape.length,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Mining failed';
    console.error('Instagram miner error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
