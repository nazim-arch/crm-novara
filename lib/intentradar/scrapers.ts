// lib/intentradar/scrapers.ts
// Signal collection from multiple sources
// Each scraper returns RawSignal[] for the scoring engine

import { getApiKey } from './db';

export interface RawSignal {
  platform: string;
  authorHandle?: string;
  authorName?: string;
  content: string;
  sourceUrl?: string;
  capturedAt: Date;
  sourceType: string;
  rawData?: any;
}

interface ScraperConfig {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  keywords: string[];
}

// ─── YOUTUBE SCRAPER ───
export async function scrapeYouTube(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('youtube');
  if (!apiKey) {
    console.log('YouTube API key not configured, skipping...');
    return [];
  }

  const signals: RawSignal[] = [];
  const searchQueries = buildSearchQueries(config, 'youtube');

  for (const query of searchQueries) {
    try {
      // Step 1: Search for relevant videos
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&order=date&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();

      // Step 2: Get comments from each video
      for (const item of searchData.items || []) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;

        try {
          const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50&order=relevance&key=${apiKey}`;
          const commentsRes = await fetch(commentsUrl);
          if (!commentsRes.ok) continue;
          const commentsData = await commentsRes.json();

          for (const comment of commentsData.items || []) {
            const snippet = comment.snippet?.topLevelComment?.snippet;
            if (!snippet) continue;

            const content = snippet.textOriginal || snippet.textDisplay || '';
            if (content.length < 15) continue; // Skip very short comments

            // Filter: only include comments that seem related to buying
            if (isRelevantComment(content, config)) {
              signals.push({
                platform: 'youtube',
                authorHandle: snippet.authorDisplayName,
                authorName: snippet.authorDisplayName,
                content,
                sourceUrl: `https://youtube.com/watch?v=${videoId}`,
                capturedAt: new Date(snippet.publishedAt),
                sourceType: 'comment',
                rawData: { videoTitle: item.snippet?.title, videoId, commentId: comment.id },
              });
            }
          }
        } catch (e) {
          console.error(`Error fetching comments for video ${videoId}:`, e);
        }
      }
    } catch (e) {
      console.error(`YouTube search error for query "${query}":`, e);
    }
  }

  return signals;
}

// ─── REDDIT SCRAPER ───
export async function scrapeReddit(config: ScraperConfig): Promise<RawSignal[]> {
  const clientId = await getApiKey('reddit_client_id');
  const clientSecret = await getApiKey('reddit_client_secret');

  const signals: RawSignal[] = [];
  const subreddits = ['IndianRealEstate', 'india', 'IndiaInvestments', 'ABCDesis'];

  // Add city-specific subreddit
  const citySubreddits: Record<string, string> = {
    'bangalore': 'bangalore', 'mumbai': 'mumbai', 'delhi': 'delhi',
    'hyderabad': 'hyderabad', 'pune': 'pune', 'chennai': 'chennai',
  };
  const citySub = citySubreddits[config.city.toLowerCase()];
  if (citySub) subreddits.push(citySub);

  // Get auth token if credentials available
  let accessToken: string | null = null;
  if (clientId && clientSecret) {
    try {
      const authRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      const authData = await authRes.json();
      accessToken = authData.access_token;
    } catch (e) {
      console.error('Reddit auth failed:', e);
    }
  }

  const headers: Record<string, string> = {
    'User-Agent': 'IntentRadar/1.0',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
  };

  const baseUrl = accessToken ? 'https://oauth.reddit.com' : 'https://www.reddit.com';

  for (const sub of subreddits) {
    try {
      const searchQueries = buildSearchQueries(config, 'reddit');
      for (const query of searchQueries) {
        const url = `${baseUrl}/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=new&t=month&limit=25&restrict_sr=on`;
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const data = await res.json();

        for (const post of data.data?.children || []) {
          const d = post.data;
          if (!d) continue;

          const content = `${d.title || ''} ${d.selftext || ''}`.trim();
          if (content.length < 20) continue;

          if (isRelevantComment(content, config)) {
            signals.push({
              platform: 'reddit',
              authorHandle: d.author,
              authorName: d.author,
              content,
              sourceUrl: `https://reddit.com${d.permalink}`,
              capturedAt: new Date((d.created_utc || Date.now() / 1000) * 1000),
              sourceType: d.selftext ? 'post' : 'comment',
              rawData: { subreddit: sub, score: d.score, numComments: d.num_comments },
            });
          }
        }
      }
    } catch (e) {
      console.error(`Reddit scrape error for r/${sub}:`, e);
    }
  }

  return signals;
}

// ─── GOOGLE MAPS REVIEWS SCRAPER ───
export async function scrapeGoogleMaps(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('google_places');
  if (!apiKey) return [];

  const signals: RawSignal[] = [];
  const searchQueries = config.microMarkets.map(m => `${config.propertyType} ${m} ${config.city}`);

  for (const query of searchQueries) {
    try {
      // Search for places
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();

      for (const place of (searchData.results || []).slice(0, 5)) {
        // Get reviews for each place
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=reviews,name&key=${apiKey}`;
        const detailRes = await fetch(detailUrl);
        if (!detailRes.ok) continue;
        const detailData = await detailRes.json();

        for (const review of detailData.result?.reviews || []) {
          if (review.text && review.text.length > 30 && isRelevantComment(review.text, config)) {
            signals.push({
              platform: 'google_maps',
              authorHandle: review.author_name,
              authorName: review.author_name,
              content: review.text,
              sourceUrl: review.author_url,
              capturedAt: new Date((review.time || Date.now() / 1000) * 1000),
              sourceType: 'review',
              rawData: { placeName: place.name, rating: review.rating, placeId: place.place_id },
            });
          }
        }
      }
    } catch (e) {
      console.error('Google Maps scrape error:', e);
    }
  }

  return signals;
}

// ─── SIMULATED PORTAL SCRAPER ───
// Note: 99acres, MagicBricks etc. don't have public APIs.
// In production, use Playwright/Puppeteer for browser-based scraping.
// This generates realistic simulated data for testing the pipeline.
export async function scrapePropertyPortals(config: ScraperConfig): Promise<RawSignal[]> {
  // In production, replace this with actual Playwright-based scraping
  // For now, this returns an empty array - the actual scraping would
  // need a separate Node.js service with Playwright/Puppeteer
  console.log('Property portal scraping requires Playwright service — skipping in API route');
  return [];
}

// ─── HELPER FUNCTIONS ───
function buildSearchQueries(config: ScraperConfig, platform: string): string[] {
  const queries: string[] = [];
  const bhk = config.bhkConfig || '';
  const type = config.propertyType;
  const city = config.city;

  // Core queries
  queries.push(`${bhk} ${type} ${city}`.trim());
  queries.push(`buy ${type} ${city}`);
  queries.push(`property ${city} ${config.budgetMin}-${config.budgetMax} crore`);

  // Location-specific
  for (const market of config.microMarkets.slice(0, 3)) {
    queries.push(`${bhk} ${type} ${market} ${city}`.trim());
  }

  // NRI-specific
  queries.push(`NRI property ${city}`);
  queries.push(`buy apartment ${city} from abroad`);

  // Add custom keywords
  for (const kw of config.keywords.slice(0, 3)) {
    queries.push(`${kw} ${city}`);
  }

  return [...new Set(queries)]; // deduplicate
}

function isRelevantComment(content: string, config: ScraperConfig): boolean {
  const lower = content.toLowerCase();
  const city = config.city.toLowerCase();

  // Must mention city OR a micro-market OR property-related keywords
  const mentionsLocation = lower.includes(city) ||
    config.microMarkets.some(m => lower.includes(m.toLowerCase()));

  const buyingKeywords = [
    'buy', 'purchase', 'looking for', 'want to', 'planning to',
    'budget', 'bhk', 'apartment', 'flat', 'villa', 'property',
    'crore', 'cr', 'lakh', 'emi', 'home loan', 'rera', 'possession',
    'invest', 'rental yield', 'appreciation', 'site visit', 'sample flat',
    'nri', 'moving', 'relocat', 'builder', 'developer', 'project',
    'vastu', 'east facing', 'registration', 'stamp duty',
  ];
  const hasBuyingIntent = buyingKeywords.some(kw => lower.includes(kw));

  return mentionsLocation || hasBuyingIntent;
}

// ─── SERP API SCRAPER (Instagram / Facebook / LinkedIn via Google Search) ───
// Uses SerpAPI to search Google with site: filters — no Meta/LinkedIn API approval needed.
// Only runs if api_key_serp is configured. Gracefully skips if not set.

async function serpSearch(
  query: string,
  platform: string,
  config: ScraperConfig,
  apiKey: string
): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  try {
    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      api_key: apiKey,
      num: '20',
      gl: 'in',   // India-biased results
      hl: 'en',
    });
    const res = await fetch(`https://serpapi.com/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();

    for (const result of data.organic_results || []) {
      const content = `${result.title || ''} ${result.snippet || ''}`.trim();
      if (content.length < 20) continue;
      if (!isRelevantComment(content, config)) continue;

      signals.push({
        platform,
        authorHandle: result.displayed_link,
        authorName: undefined,
        content,
        sourceUrl: result.link,
        capturedAt: new Date(),
        sourceType: 'post',
        rawData: { title: result.title, position: result.position },
      });
    }
  } catch (e) {
    console.error(`SerpAPI search error for "${query}" (${platform}):`, e);
  }
  return signals;
}

export async function scrapeSerpInstagram(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) {
    console.log('SerpAPI key not configured — skipping Instagram');
    return [];
  }

  const signals: RawSignal[] = [];
  const queries = [
    `site:instagram.com "${config.city}" ${config.propertyType} buy`,
    `site:instagram.com "${config.city}" ${config.microMarkets[0] || ''} property`,
    `site:instagram.com NRI "${config.city}" apartment`,
    ...config.microMarkets.slice(0, 2).map(m => `site:instagram.com "${m}" ${config.propertyType}`),
  ].filter(Boolean);

  for (const query of queries) {
    const results = await serpSearch(query, 'instagram', config, apiKey);
    signals.push(...results);
  }
  return signals;
}

export async function scrapeSerpFacebook(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) {
    console.log('SerpAPI key not configured — skipping Facebook');
    return [];
  }

  const signals: RawSignal[] = [];
  const queries = [
    `site:facebook.com/groups "${config.city}" ${config.propertyType} buy`,
    `site:facebook.com/groups NRI "${config.city}" property`,
    `site:facebook.com/groups "${config.city}" flat budget crore`,
    ...config.microMarkets.slice(0, 2).map(m => `site:facebook.com/groups "${m}" apartment`),
  ].filter(Boolean);

  for (const query of queries) {
    const results = await serpSearch(query, 'facebook', config, apiKey);
    signals.push(...results);
  }
  return signals;
}

export async function scrapeSerpLinkedIn(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) {
    console.log('SerpAPI key not configured — skipping LinkedIn');
    return [];
  }

  const signals: RawSignal[] = [];
  const queries = [
    `site:linkedin.com "relocating to ${config.city}"`,
    `site:linkedin.com "moving to ${config.city}" property`,
    `site:linkedin.com "${config.city}" "looking for" apartment`,
    `site:linkedin.com NRI "${config.city}" real estate`,
  ];

  for (const query of queries) {
    const results = await serpSearch(query, 'linkedin', config, apiKey);
    signals.push(...results);
  }
  return signals;
}

// ─── MASTER SCRAPER ───
export async function runAllScrapers(config: ScraperConfig, sources: string[]): Promise<RawSignal[]> {
  const allSignals: RawSignal[] = [];
  const scraperMap: Record<string, (config: ScraperConfig) => Promise<RawSignal[]>> = {
    youtube: scrapeYouTube,
    reddit: scrapeReddit,
    google_maps: scrapeGoogleMaps,
    instagram: scrapeSerpInstagram,
    facebook: scrapeSerpFacebook,
    linkedin: scrapeSerpLinkedIn,
    '99acres': scrapePropertyPortals,
    magicbricks: scrapePropertyPortals,
    housing: scrapePropertyPortals,
    nobroker: scrapePropertyPortals,
  };

  // Run scrapers in parallel (with concurrency limit)
  const activeSources = sources.filter(s => scraperMap[s]);
  const results = await Promise.allSettled(
    activeSources.map(source => {
      console.log(`Starting scraper: ${source}...`);
      return scraperMap[source](config).then(signals => {
        console.log(`${source}: found ${signals.length} signals`);
        return signals;
      });
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allSignals.push(...result.value);
    }
  }

  // Deduplicate by content similarity
  const seen = new Set<string>();
  const unique = allSignals.filter(s => {
    const key = s.content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Total unique signals: ${unique.length}`);
  return unique;
}

export default runAllScrapers;
