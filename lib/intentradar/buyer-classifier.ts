// lib/intentradar/buyer-classifier.ts
// Two-stage classification: Source Intent + Buyer Persona inference

export type SourceIntentType = 'buyer' | 'seller' | 'mixed' | 'irrelevant';
export type BuyerPersona = 'end_user' | 'investor' | 'nri' | 'first_time' | 'upgrade' | 'rental_frustrated' | 'broker' | 'unclear';

// ─── SOURCE INTENT CLASSIFICATION ─────────────────────────────────────────────
// Determines whether the post itself is a buyer asking, a seller listing, or mixed
// "seller" posts are high-value — buyers frequently comment on developer/listing content

const SELLER_LISTING_SIGNALS = [
  /\bfor sale\b/i,
  /\bavailable for sale\b/i,
  /\bselling\b/i,
  /\bsell\b/i,
  /price negotiable/i,
  /contact (for|me for) price/i,
  /\blisting\b/i,
  /\bsq\.?\s*ft\b/i,
  /\bsqft\b/i,
  /carpet area/i,
  /possession (ready|date)/i,
  /rera (no|number|approved)/i,
  /\boc ready\b/i,
  /site visit welcome/i,
  /asking price/i,
  /best price/i,
  /below market (rate|value)/i,
  /distress sale/i,
  /\bnew launch\b/i,
  /pre.launch/i,
  /\bbook now\b/i,
  /\bamenities include\b/i,
  /\bfloor plan\b/i,
  /\bhandover\b/i,
];

const BUYER_DEMAND_SIGNALS = [
  /looking to buy/i,
  /want to buy/i,
  /planning (to buy|to purchase)/i,
  /interested in buying/i,
  /should I buy/i,
  /is it (good|right) time to buy/i,
  /best area to buy/i,
  /which (builder|project|area) (is|to|should)/i,
  /home loan (for|in|amount|emi|eligibility)/i,  // specific, not just "home loan"
  /\bemi (calculation|calculator|amount|per month)\b/i,
  /\bnri buying\b/i,
  /relocating to/i,
  /moving to.+property/i,
  /rent vs buy/i,
  /first (time |home |flat )(buyer|purchase)/i,
  /investment (property|flat|apartment)/i,
  /rental yield/i,
  /property (advice|recommendation) for/i,  // specific, not just "advice"
  /tired of (paying )?rent/i,
  /planning to (buy|purchase|invest)/i,
];

const IRRELEVANT_SIGNALS = [
  // Generic lifestyle
  /interior design tips/i,
  /\bdiy\b.*(home|decor)/i,
  /renovation ideas/i,
  /\brecipe\b/i,
  /\bcooking\b/i,
  /\bfashion\b/i,
  // News/editorial — price debates, market reports, news articles are NOT buyer intent
  /sparks (housing|property|price) debate/i,
  /housing price debate/i,
  /realestate (debate|discussion|news)/i,
  /property (market|prices) (debate|report|news|analysis)/i,
  /\bbank holidays?\b/i,
  /public holidays?/i,
  /\bholiday list\b/i,
  /\bholiday calendar\b/i,
  // Blog/editorial markers in snippet
  /\btop \d+ (luxury|affordable|premium) (projects?|apartments?|homes?)\b/i,
  /here('s| are) (the |a )?(list of|top|best) (luxury|premium|affordable)/i,
  /\bblog\b.*(luxury|project|property)/i,
  // News Karnataka / news pages
  /news karnataka/i,
  /\bnews (report|article|update)\b/i,
];

// URL path patterns that indicate non-user-generated content — discard immediately
export const DISCARD_URL_PATTERNS = [
  /\/holiday\//i,
  /\/holidays\//i,
  /\/bank-holiday/i,
  /\/public-holiday/i,
  /\/news\//i,
  /\/article\//i,
  /newskarnataka/i,
  /\/blog\//i,          // blog posts are editorial, not buyer intent
  /\/guides?\//i,
  /\/learn\//i,
  /\/resources?\//i,
  /\/magazine\//i,
  /\/press\//i,
];

export function classifySourceIntent(content: string): SourceIntentType {
  // Hard irrelevant first — prevents false positives from generic phrases
  if (IRRELEVANT_SIGNALS.some(re => re.test(content))) return 'irrelevant';

  const isSeller = SELLER_LISTING_SIGNALS.some(re => re.test(content));
  const isBuyer  = BUYER_DEMAND_SIGNALS.some(re => re.test(content));

  if (isBuyer && isSeller) return 'mixed';
  if (isSeller) return 'seller';
  if (isBuyer) return 'buyer';
  return 'irrelevant';
}

// ─── BUYER PERSONA ────────────────────────────────────────────────────────────

export function inferBuyerPersona(content: string): BuyerPersona {
  if (/\bbroker\b|\bagent\b|\bcommission\b|on behalf of|my client/i.test(content)) return 'broker';
  if (/\bnri\b|returning to india|moving back|from (dubai|abu dhabi|us|usa|uk|singapore|uae|canada|australia|germany)/i.test(content)) return 'nri';
  if (/first.*(home|flat|property|house)|first time (buyer|home)/i.test(content)) return 'first_time';
  if (/invest(ment|or|ing)|rental yield|capital appreciation|\broi\b|rental income|passive income/i.test(content)) return 'investor';
  if (/tired of (renting|paying rent)|rent vs buy|stop(ping)? rent|landlord (issues|problem)/i.test(content)) return 'rental_frustrated';
  if (/upgrade|bigger (flat|home|house)|2bhk to 3|3bhk to 4|outgrown|need more space/i.test(content)) return 'upgrade';
  if (/\bfamily\b|\bkids\b|\bschool\b|settle down|marriage|gated community|own home/i.test(content)) return 'end_user';
  return 'unclear';
}

// ─── WHY FLAGGED ─────────────────────────────────────────────────────────────

export function buildWhyFlagged(opts: {
  sourceIntentType: SourceIntentType;
  engagementIntentType: string;
  buyerEngDensity: number;
  isHotCluster: boolean;
  matchedPhrases?: string[];
}): string {
  const { sourceIntentType, engagementIntentType, buyerEngDensity, isHotCluster, matchedPhrases = [] } = opts;
  const parts: string[] = [];

  if (sourceIntentType === 'seller')       parts.push('Seller/listing post — buyers are commenting');
  else if (sourceIntentType === 'buyer')   parts.push('Post expresses buyer demand');
  else if (sourceIntentType === 'mixed')   parts.push('Post has buyer + listing signals');

  if (engagementIntentType === 'strong_buyer')   parts.push('Commenter shows strong buy intent');
  else if (engagementIntentType === 'medium_buyer') parts.push('Commenter shows interest');

  if (isHotCluster) parts.push('Hot cluster: 3+ distinct buyers on this post');

  if (buyerEngDensity >= 0.5) {
    parts.push(`High buyer density (${Math.round(buyerEngDensity * 100)}% of comments)`);
  }

  if (matchedPhrases.length > 0) {
    parts.push(`Signals: "${matchedPhrases.slice(0, 3).join('", "')}"`);
  }

  return parts.join('. ');
}

// ─── DUAL-LANGUAGE QUERY BUILDER ─────────────────────────────────────────────
// Generates both demand-side (buyer asking) and supply-side (listing) queries
// Supply-side queries find posts where real buyers comment

export function buildDualBuyerQueries(config: {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
}): { buyerQueries: string[]; listingQueries: string[] } {
  const { city, microMarkets, propertyType, bhkConfig, budgetMin, budgetMax } = config;
  const bhk = bhkConfig || '';
  const budgetStr = `${budgetMin}-${budgetMax} crore`;
  const market = microMarkets[0] || '';
  const market2 = microMarkets[1] || '';

  const buyerQueries = [
    `looking to buy ${bhk} ${propertyType} in ${city}`.trim(),
    `want to buy apartment ${city} ${budgetStr}`,
    `planning to buy flat ${city}`,
    `first time home buyer ${city}`,
    `rent vs buy ${city} ${propertyType}`,
    `best area to buy ${bhk} flat ${city}`.trim(),
    `NRI buying property ${city}`,
    `relocating to ${city} property advice`,
    `home loan ${budgetStr} ${city}`,
    `is it good time to buy property ${city}`,
    `${city} real estate buyer advice forum`,
    market ? `buy ${bhk} ${propertyType} ${market} ${city}`.trim() : '',
    market2 ? `${market2} ${city} flat recommendation` : '',
  ].filter(Boolean) as string[];

  // Supply-side queries — find listing/developer posts buyers comment on
  const listingQueries = [
    `${city} ${bhk} ${propertyType} for sale ${budgetStr}`.trim(),
    `new launch ${propertyType} ${city}`,
    `${city} ${propertyType} possession ready`,
    `developer launch ${city} ${propertyType} ${bhk}`.trim(),
    `${city} new project launch ${budgetStr}`,
    market ? `${market} ${city} flat for sale new launch` : '',
    market ? `site:instagram.com "${city}" "${market}" new launch ${propertyType}` : '',
    `site:instagram.com "${city}" ${propertyType} for sale ${bhk}`.trim(),
  ].filter(Boolean) as string[];

  return {
    buyerQueries: [...new Set(buyerQueries)],
    listingQueries: [...new Set(listingQueries)],
  };
}
