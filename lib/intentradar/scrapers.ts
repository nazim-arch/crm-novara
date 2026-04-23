// lib/intentradar/scrapers.ts
// Signal collection from multiple sources — mode-aware (BUYER | SELLER)

import { getApiKey } from './db';
import { buildBuyerQueries, isBuyerSignal, BUYER_ALLOWED_SOURCES, BUYER_EXCLUDED_SOURCES } from './modes/buyer';
import { buildSellerQueries, isSellerSignal, extractListingPrice, SELLER_ALLOWED_SOURCES, SELLER_EXCLUDED_SOURCES } from './modes/seller';
import { extractCommentIntentSignals, extractEngagementCount, resolveLeadType } from './comment-intent';
import { classifyCommentIntent, analyzePostEngagement, gatePost } from './engagement';
import { classifySourceIntent, inferBuyerPersona, buildWhyFlagged, buildDualBuyerQueries, DISCARD_URL_PATTERNS } from './buyer-classifier';

export interface RawSignal {
  platform: string;
  authorHandle?: string;
  authorName?: string;
  content: string;
  sourceUrl?: string;
  capturedAt: Date;
  sourceType: string;
  rawData?: any;
  originType?: 'real' | 'synthetic';
  leadType?: 'DIRECT' | 'SIGNAL';
  // Seller-specific
  listingPrice?: string;
  // Engagement-validated buyer pipeline fields
  engagementScore?: number;
  buyerEngDensity?: number;
  isHotCluster?: boolean;
  buyerPersona?: string;
  sourceIntentType?: string;
  engagementIntentType?: string;
  exactComment?: string;
  whyFlagged?: string;
}

export interface ScraperConfig {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  keywords: string[];
  urgency?: string;
  buyerPersonas?: string[];
  intentMode?: 'BUYER' | 'SELLER';
}

// ─── AGE CUTOFFS ──────────────────────────────────────────────────────────────
const BUYER_MAX_AGE_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days
const SELLER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function maxAgeMs(config: ScraperConfig): number {
  return config.intentMode === 'SELLER' ? SELLER_MAX_AGE_MS : BUYER_MAX_AGE_MS;
}

function isWithinAge(date: Date, limitMs: number): boolean {
  return Date.now() - date.getTime() <= limitMs;
}

// ─── SHARED HELPERS ────────────────────────────────────────────────────────────

function getQueries(config: ScraperConfig): string[] {
  return config.intentMode === 'SELLER'
    ? buildSellerQueries(config)
    : buildBuyerQueries(config);
}

function isRelevantSignal(content: string, config: ScraperConfig): boolean {
  const lower = content.toLowerCase();
  const city = config.city.toLowerCase();

  const mentionsLocation =
    lower.includes(city) ||
    config.microMarkets.some(m => lower.includes(m.toLowerCase()));

  if (config.intentMode === 'SELLER') {
    return mentionsLocation || isSellerSignal(content);
  }
  return mentionsLocation || isBuyerSignal(content);
}

// ─── YOUTUBE ──────────────────────────────────────────────────────────────────
// Each commenter showing buyer intent becomes a separate lead (not the video/post author)
export async function scrapeYouTube(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('youtube');
  if (!apiKey) { console.log('YouTube API key not configured, skipping...'); return []; }

  const signals: RawSignal[] = [];
  const queries = getQueries(config).slice(0, 5);
  const publishedAfter = new Date(Date.now() - maxAgeMs(config)).toISOString();

  for (const query of queries) {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=8&order=date&publishedAfter=${encodeURIComponent(publishedAfter)}&key=${apiKey}`
      );
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();

      for (const item of searchData.items || []) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;
        const videoTitle = item.snippet?.title || '';

        try {
          // Fetch video stats to gate by engagement
          const statsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`
          );
          const statsData = statsRes.ok ? await statsRes.json() : null;
          const stats = statsData?.items?.[0]?.statistics ?? {};
          const likes    = parseInt(stats.likeCount    || '0', 10);
          const viewCount = parseInt(stats.viewCount   || '0', 10);
          const commentCount = parseInt(stats.commentCount || '0', 10);

          // Gate: skip low-engagement videos (weak signal quality)
          if (!gatePost({ likes, comments: commentCount, views: viewCount })) continue;

          const sourceIntentType = classifySourceIntent(videoTitle);
          if (sourceIntentType === 'irrelevant') continue;

          const commentsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50&order=relevance&key=${apiKey}`
          );
          if (!commentsRes.ok) continue;
          const commentsData = await commentsRes.json();

          // Build comment array for engagement analysis
          const rawComments = (commentsData.items || []).map((c: any) => {
            const s = c.snippet?.topLevelComment?.snippet;
            return {
              authorHandle: s?.authorChannelId?.value || s?.authorDisplayName,
              authorName: s?.authorDisplayName,
              text: s?.textOriginal || s?.textDisplay || '',
              profileUrl: s?.authorProfileImageUrl,
            };
          }).filter((c: any) => c.text.length >= 10);

          const analysis = analyzePostEngagement({ likes, comments: rawComments.length, views: viewCount }, rawComments);

          if (!analysis.passesGate) continue;

          // Create one lead per buyer-intent commenter (not per video)
          for (const buyerComment of analysis.buyerIntentComments) {
            const commentDate = new Date();
            if (!isWithinAge(commentDate, maxAgeMs(config))) continue;

            const buyerPersona = inferBuyerPersona(buyerComment.comment);
            const whyFlagged = buildWhyFlagged({
              sourceIntentType,
              engagementIntentType: buyerComment.intentType,
              buyerEngDensity: analysis.buyerEngDensity,
              isHotCluster: analysis.isHotCluster,
              matchedPhrases: extractCommentIntentSignals(buyerComment.comment),
            });

            signals.push({
              platform: 'youtube',
              authorHandle: buyerComment.authorHandle,
              authorName: buyerComment.authorName,
              content: `[Video: ${videoTitle}] ${buyerComment.comment}`,
              sourceUrl: `https://youtube.com/watch?v=${videoId}`,
              capturedAt: commentDate,
              sourceType: 'comment',
              leadType: 'DIRECT',
              sourceIntentType,
              engagementIntentType: buyerComment.intentType,
              engagementScore: analysis.engagementScore,
              buyerEngDensity: analysis.buyerEngDensity,
              isHotCluster: analysis.isHotCluster,
              buyerPersona,
              exactComment: buyerComment.comment,
              whyFlagged,
              rawData: { videoTitle, videoId, channelId: buyerComment.authorHandle, likes, viewCount, commentCount },
            });
          }
        } catch (e) { console.error(`YouTube comments error ${videoId}:`, e); }
      }
    } catch (e) { console.error(`YouTube search error "${query}":`, e); }
  }

  return signals;
}

// ─── REDDIT ───────────────────────────────────────────────────────────────────
// Creates one lead per buyer-intent commenter, not per post
export async function scrapeReddit(config: ScraperConfig): Promise<RawSignal[]> {
  const clientId = await getApiKey('reddit_client_id');
  const clientSecret = await getApiKey('reddit_client_secret');

  const subreddits = ['IndianRealEstate', 'india', 'IndiaInvestments', 'ABCDesis'];
  const citySubreddits: Record<string, string> = {
    bangalore: 'bangalore', mumbai: 'mumbai', delhi: 'delhi',
    hyderabad: 'hyderabad', pune: 'pune', chennai: 'chennai',
  };
  const citySub = citySubreddits[config.city.toLowerCase()];
  if (citySub) subreddits.push(citySub);

  let accessToken: string | null = null;
  if (clientId && clientSecret) {
    try {
      const authRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      const authData = await authRes.json();
      accessToken = authData.access_token;
    } catch (e) { console.error('Reddit auth failed:', e); }
  }

  const headers: Record<string, string> = {
    'User-Agent': 'IntentRadar/1.0',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  const baseUrl = accessToken ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const signals: RawSignal[] = [];
  const queries = getQueries(config).slice(0, 4);
  // Track seen user+post combos to avoid duplicates
  const seenKeys = new Set<string>();

  for (const sub of subreddits) {
    for (const query of queries) {
      try {
        const res = await fetch(
          `${baseUrl}/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25&restrict_sr=on`,
          { headers }
        );
        if (!res.ok) continue;
        const data = await res.json();

        for (const post of data.data?.children || []) {
          const d = post.data;
          if (!d) continue;
          const postContent = `${d.title || ''} ${d.selftext || ''}`.trim();
          if (postContent.length < 20) continue;
          if (!isRelevantSignal(postContent, config)) continue;
          const postDate = new Date((d.created_utc || 0) * 1000);
          if (!isWithinAge(postDate, maxAgeMs(config))) continue;

          const sourceIntentType = classifySourceIntent(postContent);
          if (sourceIntentType === 'irrelevant') continue;

          // Gate by post engagement
          const postEng = { likes: Math.max(d.score || 0, 0), comments: d.num_comments || 0 };
          const postAuthorIsIntent = classifyCommentIntent(postContent);

          // If the POST AUTHOR shows buyer intent, create a lead for them directly
          if (postAuthorIsIntent === 'strong_buyer' || postAuthorIsIntent === 'medium_buyer') {
            const key = `${d.author}::${d.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              const buyerPersona = inferBuyerPersona(postContent);
              const whyFlagged = buildWhyFlagged({
                sourceIntentType,
                engagementIntentType: postAuthorIsIntent,
                buyerEngDensity: 1,
                isHotCluster: false,
                matchedPhrases: extractCommentIntentSignals(postContent),
              });
              signals.push({
                platform: 'reddit',
                authorHandle: `u/${d.author}`,
                authorName: d.author,
                content: postContent,
                sourceUrl: `https://reddit.com${d.permalink}`,
                capturedAt: postDate,
                sourceType: 'post',
                leadType: 'DIRECT',
                sourceIntentType,
                engagementIntentType: postAuthorIsIntent,
                engagementScore: Math.min(postEng.likes + postEng.comments * 3, 100),
                buyerEngDensity: 1,
                isHotCluster: false,
                buyerPersona,
                exactComment: postContent.slice(0, 500),
                whyFlagged,
                rawData: { subreddit: sub, score: d.score, numComments: d.num_comments },
              });
            }
          }

          // If post has enough engagement, fetch comments and create commenter-level leads
          if (gatePost(postEng) && d.permalink) {
            try {
              const commentsRes = await fetch(
                `${baseUrl}${d.permalink}.json?limit=50&sort=top`,
                { headers }
              );
              if (!commentsRes.ok) continue;
              const commentsJson = await commentsRes.json();
              const commentListing = commentsJson?.[1]?.data?.children || [];

              const rawComments = commentListing
                .filter((c: any) => c.kind === 't1')
                .map((c: any) => ({
                  authorHandle: c.data?.author ? `u/${c.data.author}` : undefined,
                  authorName: c.data?.author,
                  text: c.data?.body || '',
                }))
                .filter((c: any) => c.text.length >= 10 && c.authorName !== '[deleted]');

              const analysis = analyzePostEngagement(postEng, rawComments);
              if (!analysis.passesGate) continue;

              for (const buyerComment of analysis.buyerIntentComments) {
                const key = `${buyerComment.authorHandle}::${d.id}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);

                const buyerPersona = inferBuyerPersona(buyerComment.comment);
                const whyFlagged = buildWhyFlagged({
                  sourceIntentType,
                  engagementIntentType: buyerComment.intentType,
                  buyerEngDensity: analysis.buyerEngDensity,
                  isHotCluster: analysis.isHotCluster,
                  matchedPhrases: extractCommentIntentSignals(buyerComment.comment),
                });

                signals.push({
                  platform: 'reddit',
                  authorHandle: buyerComment.authorHandle,
                  authorName: buyerComment.authorName,
                  content: `[r/${sub}: ${d.title}] ${buyerComment.comment}`,
                  sourceUrl: `https://reddit.com${d.permalink}`,
                  capturedAt: postDate,
                  sourceType: 'comment',
                  leadType: 'DIRECT',
                  sourceIntentType,
                  engagementIntentType: buyerComment.intentType,
                  engagementScore: analysis.engagementScore,
                  buyerEngDensity: analysis.buyerEngDensity,
                  isHotCluster: analysis.isHotCluster,
                  buyerPersona,
                  exactComment: buyerComment.comment,
                  whyFlagged,
                  rawData: { subreddit: sub, postTitle: d.title, postScore: d.score, postComments: d.num_comments },
                });
              }
            } catch (e) { console.error(`Reddit comments fetch error:`, e); }
          }
        }
      } catch (e) { console.error(`Reddit error r/${sub}:`, e); }
    }
  }
  return signals;
}

// ─── GOOGLE MAPS ──────────────────────────────────────────────────────────────
export async function scrapeGoogleMaps(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('google_places');
  if (!apiKey) return [];

  const signals: RawSignal[] = [];
  for (const market of config.microMarkets.slice(0, 3)) {
    try {
      const query = `${config.propertyType} ${market} ${config.city}`;
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`
      );
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();

      for (const place of (searchData.results || []).slice(0, 5)) {
        const detailRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=reviews,name&key=${apiKey}`
        );
        if (!detailRes.ok) continue;
        const detailData = await detailRes.json();

        for (const review of detailData.result?.reviews || []) {
          if (!review.text || review.text.length < 30) continue;
          if (!isRelevantSignal(review.text, config)) continue;
          const reviewDate = new Date((review.time || 0) * 1000);
          if (!isWithinAge(reviewDate, maxAgeMs(config))) continue;
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
    } catch (e) { console.error('Google Maps error:', e); }
  }
  return signals;
}

// ─── SHARED SERP HELPER ───────────────────────────────────────────────────────
interface SerpOpts {
  leadType?: 'DIRECT' | 'SIGNAL'; // SIGNAL = no user identity, manual outreach needed
}

async function serpSearch(query: string, platform: string, config: ScraperConfig, apiKey: string, opts: SerpOpts = {}): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  // tbs=qdr:m = past month (both buyer and seller)
  const tbs = 'qdr:m';
  const leadType = opts.leadType ?? 'DIRECT';
  try {
    const params = new URLSearchParams({ engine: 'google', q: query, api_key: apiKey, num: '20', gl: 'in', hl: 'en', tbs });
    const res = await fetch(`https://serpapi.com/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();

    for (const result of data.organic_results || []) {
      // URL-level discard — holiday pages, blog posts, news articles, editorial content
      const url: string = result.link || '';
      if (DISCARD_URL_PATTERNS.some(re => re.test(url))) continue;

      const content = `${result.title || ''} ${result.snippet || ''}`.trim();
      if (content.length < 20) continue;
      if (!isRelevantSignal(content, config)) continue;

      const sourceIntentType = config.intentMode === 'BUYER' ? classifySourceIntent(content) : undefined;
      // Discard clearly irrelevant posts in buyer mode
      if (config.intentMode === 'BUYER' && sourceIntentType === 'irrelevant') continue;

      const buyerPersona = config.intentMode === 'BUYER' ? inferBuyerPersona(content) : undefined;

      signals.push({
        platform,
        // SIGNAL sources: never set authorHandle — no user identity available
        authorHandle: leadType === 'SIGNAL' ? undefined : result.displayed_link,
        content,
        sourceUrl: result.link,
        capturedAt: new Date(),
        sourceType: 'post',
        leadType,
        sourceIntentType,
        buyerPersona,
        rawData: { title: result.title, position: result.position },
        ...(config.intentMode === 'SELLER' ? { listingPrice: extractListingPrice(content) || undefined } : {}),
      });
    }
  } catch (e) { console.error(`SerpAPI error "${query}" (${platform}):`, e); }
  return signals;
}

async function serpBatch(queries: string[], platform: string, config: ScraperConfig, apiKey: string, opts: SerpOpts = {}): Promise<RawSignal[]> {
  const all: RawSignal[] = [];
  for (const query of queries) all.push(...await serpSearch(query, platform, config, apiKey, opts));
  return all;
}

// ─── SERP SCRAPERS (BUYER MODE) ───────────────────────────────────────────────
export async function scrapeSerpInstagram(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) { console.log('SerpAPI not configured — skipping Instagram'); return []; }

  // Instagram is SIGNAL: no user identity. Use dual queries (buyer + listing language)
  const { buyerQueries, listingQueries } = buildDualBuyerQueries(config);
  const igBuyerQueries = buyerQueries.slice(0, 3).map(q => `site:instagram.com ${q}`);
  const igListingQueries = listingQueries.slice(0, 3).map(q => `site:instagram.com ${q}`);
  const queries = [...igBuyerQueries, ...igListingQueries];

  const raw = await serpBatch(queries, 'instagram', config, apiKey, { leadType: 'SIGNAL' });

  return raw
    .map(s => {
      const engagement = extractEngagementCount(s.content);
      const commentIntentPhrases = extractCommentIntentSignals(s.content);
      const sourceIntentType = classifySourceIntent(s.content);
      if (sourceIntentType === 'irrelevant') return null;

      // Gate: snippet must show at least some engagement signals or buyer phrases
      const engPasses = (engagement.likes ?? 0) >= 5 || (engagement.comments ?? 0) >= 2 || commentIntentPhrases.length >= 1;
      if (!engPasses) return null;

      const engScore = Math.min((engagement.likes ?? 0) * 2 + (engagement.comments ?? 0) * 5, 100);
      const buyerPersona = inferBuyerPersona(s.content);
      const whyFlagged = buildWhyFlagged({
        sourceIntentType,
        engagementIntentType: commentIntentPhrases.length > 0 ? 'medium_buyer' : 'noise',
        buyerEngDensity: 0,
        isHotCluster: false,
        matchedPhrases: commentIntentPhrases,
      });

      return {
        ...s,
        authorHandle: undefined,
        sourceIntentType,
        engagementScore: engScore,
        buyerPersona,
        whyFlagged,
        rawData: {
          ...s.rawData,
          engagement,
          commentIntentPhrases,
          nextAction: 'Open post and manually engage with commenters via Instagram',
          signalNote: 'Instagram signal — user identity not extracted. High-intent post detected.',
        },
      };
    })
    .filter(Boolean) as RawSignal[];
}

export async function scrapeSerpFacebook(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) { console.log('SerpAPI not configured — skipping Facebook'); return []; }

  const { listingQueries } = buildDualBuyerQueries(config);
  const queries = [
    `site:facebook.com/groups "${config.city}" ${config.propertyType} buy`,
    `site:facebook.com/groups NRI "${config.city}" property`,
    `site:facebook.com/groups "${config.city}" flat budget crore`,
    ...listingQueries.slice(0, 2).map(q => `site:facebook.com/groups ${q}`),
  ].filter(Boolean);

  const raw = await serpBatch(queries, 'facebook', config, apiKey, { leadType: 'SIGNAL' });

  return raw
    .map(s => {
      const commentIntentPhrases = extractCommentIntentSignals(s.content);
      const sourceIntentType = classifySourceIntent(s.content);
      if (sourceIntentType === 'irrelevant') return null;

      const engagement = extractEngagementCount(s.content);
      const engPasses = (engagement.likes ?? 0) >= 5 || (engagement.comments ?? 0) >= 2 || commentIntentPhrases.length >= 1;
      if (!engPasses) return null;

      const buyerPersona = inferBuyerPersona(s.content);
      const whyFlagged = buildWhyFlagged({
        sourceIntentType,
        engagementIntentType: commentIntentPhrases.length > 0 ? 'medium_buyer' : 'noise',
        buyerEngDensity: 0,
        isHotCluster: false,
        matchedPhrases: commentIntentPhrases,
      });

      return {
        ...s,
        authorHandle: undefined,
        sourceIntentType,
        buyerPersona,
        whyFlagged,
        rawData: {
          ...s.rawData,
          commentIntentPhrases,
          nextAction: 'Open Facebook group post and manually engage with interested members',
        },
      };
    })
    .filter(Boolean) as RawSignal[];
}

export async function scrapeSerpLinkedIn(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) { console.log('SerpAPI not configured — skipping LinkedIn'); return []; }
  // All queries must include property/real estate terms — prevents career relocation posts matching
  const queries = [
    `site:linkedin.com "relocating to ${config.city}" property`,
    `site:linkedin.com "relocating to ${config.city}" "looking to buy"`,
    `site:linkedin.com "moving to ${config.city}" "buy flat"`,
    `site:linkedin.com NRI "${config.city}" real estate property`,
    `site:linkedin.com "${config.city}" "looking to buy" ${config.propertyType}`,
  ];
  return serpBatch(queries, 'linkedin', config, apiKey);
}

export async function scrapeSerpQuora(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) { console.log('SerpAPI not configured — skipping Quora'); return []; }
  const queries = [
    `site:quora.com "${config.city}" ${config.propertyType} buy`,
    `site:quora.com "best area to buy" "${config.city}"`,
    `site:quora.com NRI property "${config.city}"`,
    ...config.microMarkets.slice(0, 2).map(m => `site:quora.com "${m}" "${config.city}" property`),
  ].filter(Boolean);
  return serpBatch(queries, 'quora', config, apiKey);
}

export async function scrapeSerpNews(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) return [];
  const queries = [
    `site:economictimes.indiatimes.com "${config.city}" property buyers`,
    `site:moneycontrol.com real estate "${config.city}" apartment`,
    `site:livemint.com property "${config.city}" buy`,
  ];
  return serpBatch(queries, 'news', config, apiKey);
}

export async function scrapeSerpFinancial(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) return [];
  // Avoid portal domains that return blog/holiday pages — use Q&A and forum queries instead
  const queries = [
    `"home loan" "looking to buy" "${config.city}" ${config.propertyType} forum`,
    `"home loan eligibility" "${config.city}" property buyer forum`,
    `NRI "home loan" "${config.city}" buying property forum`,
    `site:quora.com "home loan" "${config.city}" ${config.propertyType} buy`,
    `site:reddit.com "home loan" "${config.city}" property`,
  ];
  return serpBatch(queries, 'financial_forums', config, apiKey);
}

export async function scrapeSerpPortalForums(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) return [];
  const queries = [
    `site:99acres.com "looking to buy" "${config.city}"`,
    `site:nobroker.in "want to buy" "${config.city}"`,
    `site:housing.com "looking for" "${config.city}" ${config.propertyType}`,
    ...config.microMarkets.slice(0, 2).map(m => `site:99acres.com "${m}" "${config.city}" buyer`),
  ].filter(Boolean);
  return serpBatch(queries, 'portal_forums', config, apiKey);
}

// ─── SELLER: PORTAL LISTINGS SCRAPER ─────────────────────────────────────────
export async function scrapeSellerPortals(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('serp');
  if (!apiKey) { console.log('SerpAPI not configured — skipping portal listings'); return []; }

  const queries = buildSellerQueries(config)
    .filter(q => q.startsWith('site:'))  // only site: queries for actual listings
    .slice(0, 8);

  const signals = await serpBatch(queries, 'portal_listing', config, apiKey);
  // Enrich with listing price
  return signals.map(s => ({
    ...s,
    listingPrice: s.listingPrice || extractListingPrice(s.content) || undefined,
    sourceType: 'listing',
  }));
}

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────
export async function scrapeTelegram(config: ScraperConfig): Promise<RawSignal[]> {
  const botToken = await getApiKey('telegram_bot');
  if (!botToken) { console.log('Telegram Bot Token not configured — skipping'); return []; }

  const signals: RawSignal[] = [];
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100&timeout=0`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.ok) return [];

    for (const update of data.result || []) {
      const message = update.message || update.channel_post;
      if (!message?.text || message.text.length < 20) continue;
      if (!isRelevantSignal(message.text, config)) continue;
      const msgDate = new Date((message.date || 0) * 1000);
      if (!isWithinAge(msgDate, maxAgeMs(config))) continue;

      const authorName = message.from
        ? `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim()
        : undefined;

      signals.push({
        platform: 'telegram',
        authorHandle: message.from?.username ? `@${message.from.username}` : undefined,
        authorName: authorName || undefined,
        content: message.text,
        sourceUrl: message.chat?.username ? `https://t.me/${message.chat.username}` : undefined,
        capturedAt: new Date((message.date || Date.now() / 1000) * 1000),
        sourceType: 'message',
        rawData: { chatTitle: message.chat?.title, chatType: message.chat?.type },
      });
    }
  } catch (e) { console.error('Telegram error:', e); }
  return signals;
}

// ─── OPENAI: BUYER SIGNAL GENERATOR ──────────────────────────────────────────
export async function scrapeOpenAI(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('openai');
  if (!apiKey) { console.log('OpenAI key not configured — skipping'); return []; }

  const budgetStr = `₹${config.budgetMin}–${config.budgetMax} Cr`;
  const markets = config.microMarkets.join(', ');
  const bhk = config.bhkConfig ? `${config.bhkConfig} ` : '';
  const keywords = config.keywords.length ? `\nAdditional signals: ${config.keywords.join(', ')}` : '';

  const prompt = `You are a real estate market intelligence system for the Indian property market.

Generate 25 realistic BUYER intent signals — comments or posts that genuine buyers write on YouTube, Reddit, housing forums, or LinkedIn — for people looking to buy property:

City: ${config.city}
Areas: ${markets}
Property: ${bhk}${config.propertyType}
Budget: ${budgetStr}
Urgency: ${config.urgency}
Buyer types: ${config.buyerPersonas?.join(', ') || 'general buyers'}${keywords}

Rules:
- Mix platforms: youtube_comment, reddit_post, forum_post, linkedin_post
- Vary intent: some very specific (budget+area+builder locked), some exploratory
- 20% NRI buyers (US/UAE/UK/Singapore)
- Natural Indian English: EMI, RERA, possession, OC, clubhouse, gated community
- Include author handles (Indian names)
- Each signal unique and realistic

Return ONLY valid JSON: { "signals": [{ "platform", "author_handle", "author_name", "content", "source_url" }] }`;

  return callOpenAISignalGenerator(apiKey, prompt, 'openai_generated', 'ai_generated', 'synthetic');
}

// ─── OPENAI: SELLER LISTING GENERATOR ────────────────────────────────────────
export async function scrapeOpenAISeller(config: ScraperConfig): Promise<RawSignal[]> {
  const apiKey = await getApiKey('openai');
  if (!apiKey) { console.log('OpenAI key not configured — skipping seller generation'); return []; }

  const budgetStr = `₹${config.budgetMin}–${config.budgetMax} Cr`;
  const markets = config.microMarkets.join(', ');
  const bhk = config.bhkConfig ? `${config.bhkConfig} ` : '';
  const keywords = config.keywords.length ? `\nAdditional context: ${config.keywords.join(', ')}` : '';

  const prompt = `You are a real estate listing intelligence system for the Indian property market.

Generate 25 realistic SELLER listings or sale posts — property listings, owner posts, broker listings, or developer announcements — for properties available in:

City: ${config.city}
Areas: ${markets}
Property: ${bhk}${config.propertyType}
Price range: ${budgetStr}${keywords}

Rules:
- Mix seller types: direct owner (40%), broker/agent (40%), developer/builder (20%)
- Include: property size (sqft), price, area, BHK config, possession status
- Vary: resale flats, new launches, urgent sales, ready-to-move, under-construction
- Include contact signals: "call for price", "site visit welcome", "negotiable"
- 20% urgent/distress sales
- Natural Indian real estate listing language: RERA no, OC, SBA, carpet area, facing
- Each listing unique with realistic details

Return ONLY valid JSON: { "signals": [{ "platform", "author_handle", "author_name", "content", "source_url" }] }`;

  const signals = await callOpenAISignalGenerator(apiKey, prompt, 'openai_generated_seller', 'listing', 'synthetic');
  // Enrich with listing price
  return signals.map(s => ({
    ...s,
    listingPrice: extractListingPrice(s.content) || undefined,
  }));
}

async function callOpenAISignalGenerator(
  apiKey: string,
  prompt: string,
  platform: string,
  sourceType: string,
  originType: 'real' | 'synthetic'
): Promise<RawSignal[]> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4000,
        temperature: 0.85,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You generate realistic real estate intent signals. Always return valid JSON with a "signals" array.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) { console.error('OpenAI error:', res.status, await res.text()); return []; }
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}') as { signals?: any[] };

    return (parsed.signals || [])
      .filter((s: any) => s.content?.length > 20)
      .map((s: any) => ({
        platform,
        authorHandle: s.author_handle || undefined,
        authorName: s.author_name || undefined,
        content: s.content,
        sourceUrl: s.source_url || undefined,
        capturedAt: new Date(),
        sourceType,
        originType,
        rawData: { generated_by: 'openai', model: 'gpt-4o' },
      }));
  } catch (err) {
    console.error('OpenAI generation failed:', err);
    return [];
  }
}

// ─── MASTER SCRAPER ───────────────────────────────────────────────────────────
export async function runAllScrapers(config: ScraperConfig, sources: string[]): Promise<RawSignal[]> {
  const mode = config.intentMode || 'BUYER';

  // Enforce mode-based source filtering
  const filteredSources = sources.filter(s => {
    if (mode === 'BUYER' && BUYER_EXCLUDED_SOURCES.has(s)) return false;
    if (mode === 'SELLER' && SELLER_EXCLUDED_SOURCES.has(s)) return false;
    return true;
  });

  // Add mode-specific OpenAI source if not already present
  if (mode === 'SELLER' && !filteredSources.includes('openai_generate_seller') && !filteredSources.includes('portal_listings')) {
    filteredSources.push('openai_generate_seller');
  }

  const scraperMap: Record<string, (config: ScraperConfig) => Promise<RawSignal[]>> = {
    // BUYER sources
    openai_generate: scrapeOpenAI,
    youtube: scrapeYouTube,
    reddit: scrapeReddit,
    google_maps: scrapeGoogleMaps,
    instagram: scrapeSerpInstagram,
    facebook: scrapeSerpFacebook,
    linkedin: scrapeSerpLinkedIn,
    telegram: scrapeTelegram,
    quora: scrapeSerpQuora,
    news: scrapeSerpNews,
    financial_forums: scrapeSerpFinancial,
    portal_forums: scrapeSerpPortalForums,
    // SELLER sources
    openai_generate_seller: scrapeOpenAISeller,
    portal_listings: scrapeSellerPortals,
    '99acres': scrapeSellerPortals,
    magicbricks: scrapeSellerPortals,
    housing: scrapeSellerPortals,
    nobroker: scrapeSellerPortals,
    squareyards: scrapeSellerPortals,
  };

  const activeSources = filteredSources.filter(s => scraperMap[s]);
  console.log(`[IntentRadar] Mode: ${mode} | Running scrapers: ${activeSources.join(', ')}`);

  const results = await Promise.allSettled(
    activeSources.map(source =>
      scraperMap[source](config).then(signals => {
        console.log(`${source}: ${signals.length} signals`);
        return signals;
      })
    )
  );

  const allSignals: RawSignal[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allSignals.push(...r.value);
  }

  // Deduplicate by content prefix
  const seen = new Set<string>();
  const unique = allSignals.filter(s => {
    const key = s.content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Final age gate — drop anything older than mode cutoff (catches any scraper that set capturedAt from external timestamp)
  const limitMs = mode === 'SELLER' ? SELLER_MAX_AGE_MS : BUYER_MAX_AGE_MS;
  const fresh = unique.filter(s => isWithinAge(s.capturedAt, limitMs));

  console.log(`[IntentRadar] Total unique signals: ${unique.length} → after age filter: ${fresh.length}`);
  return fresh;
}

export default runAllScrapers;
