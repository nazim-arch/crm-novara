// lib/intentradar/modes/buyer.ts
// BUYER mode: query generation, intent signals, source rules

// Sources that reliably produce real user-generated buyer intent.
// instagram/facebook removed — SerpAPI can't access real engagement data.
// news/financial_forums removed — return editorial/commercial pages, not buyer voices.
export const BUYER_ALLOWED_SOURCES = new Set([
  'youtube',        // direct API — real comments with identity
  'reddit',         // direct API — real posts and comments
  'quora',          // SerpAPI — Q&A content IS user questions
  'linkedin',       // SerpAPI — strict phrases required
  'telegram',       // direct API — real messages
  'openai_generate',// synthetic — for demo/testing
  // opt-in only (no real engagement data via SerpAPI):
  'instagram', 'facebook', 'portal_forums',
]);

export const BUYER_EXCLUDED_SOURCES = new Set([
  '99acres', 'magicbricks', 'housing', 'nobroker', 'squareyards',
  'news', 'financial_forums',
  'openai_generate_seller',
]);

// 100+ buyer intent signals — used in query building and filtering
export const BUYER_INTENT_PHRASES = [
  'looking to buy', 'planning to buy', 'want to purchase', 'interested in buying',
  'thinking of buying', 'ready to buy', 'buying first home', 'first time home buyer',
  'want own house', 'tired of renting', 'rent vs buy', 'should I buy flat now',
  'is it good time to buy property', 'want to buy flat', 'buy apartment', 'buy property',
  'purchase property', 'buy house', 'buy flat',
  // Location driven
  'best area to buy', 'where to buy flat', 'safe area for family',
  'near Manyata flat', 'near Whitefield apartment', 'near metro apartment',
  // Budget driven
  'budget 60 lakhs', 'under 70 lakh', 'around 75 lakh', 'affordable flat',
  'mid-range apartment', 'budget for flat', 'crore budget', 'lakh budget',
  // Relocation
  'moving to Bangalore', 'relocating to Bangalore', 'shifting to Bangalore',
  'coming from Dubai', 'NRI buying property', 'returning to India property',
  'moving back to India', 'NRI investment', 'settling in India',
  // Decision stage
  'which builder is good', 'builder review', 'is this project worth',
  'any feedback on project', 'is this a good investment', 'resale vs new apartment',
  'builder reputation', 'rera approved', 'oc certificate',
  // Urgency
  'planning to buy this year', 'need flat urgently', 'finalizing property',
  'ready for site visit', 'closing soon', 'looking for possession ready',
  // Family
  'family of 3 looking', 'near school apartment', 'near office flat',
  'commute friendly home', 'kids room', 'gated community family',
  // Investor
  'investment property', 'rental yield', 'capital appreciation',
  'plots vs apartment', 'roi real estate', 'rental income property',
  // Financial
  'home loan', 'emi', 'down payment', 'pre-approved loan',
  'sbi home loan', 'hdfc home loan', 'stamp duty', 'registration charges',
  // General
  'bhk', 'apartment', 'flat', 'villa', 'property', 'possession', 'rera',
  'sample flat', 'site visit', 'clubhouse', 'amenities', 'vastu',
];

export function buildBuyerQueries(config: {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  keywords: string[];
  buyerPersonas?: string[];
  urgency?: string;
}): string[] {
  const q: string[] = [];
  const { city, microMarkets, propertyType, bhkConfig, budgetMin, budgetMax, keywords } = config;
  const bhk = bhkConfig || '';
  const budgetStr = `${budgetMin}-${budgetMax} crore`;

  // Core buyer queries
  q.push(`looking to buy ${bhk} ${propertyType} in ${city}`.trim());
  q.push(`want to buy apartment ${city} ${budgetStr}`);
  q.push(`planning to buy flat ${city}`);
  q.push(`buy ${propertyType} ${city} advice`);
  q.push(`first time home buyer ${city}`);
  q.push(`rent vs buy ${city} ${propertyType}`);
  q.push(`best area to buy ${bhk} flat ${city}`.trim());
  q.push(`is it good time to buy property ${city}`);
  q.push(`${city} real estate buyer advice`);

  // Location-specific
  for (const market of microMarkets.slice(0, 4)) {
    q.push(`buy ${bhk} ${propertyType} ${market} ${city}`.trim());
    q.push(`${market} ${city} property budget ${budgetStr}`);
  }

  // Budget-specific
  q.push(`${budgetStr} ${propertyType} ${city}`);
  q.push(`affordable ${propertyType} under ${budgetMax} crore ${city}`);
  q.push(`budget ${budgetStr} flat ${city} recommendation`);

  // NRI / relocation
  q.push(`NRI buying property ${city}`);
  q.push(`relocating to ${city} property advice`);
  q.push(`moving to ${city} which area to buy flat`);

  // Decision stage
  q.push(`${city} builder review ${propertyType}`);
  q.push(`which project to buy ${city} ${microMarkets[0] || ''}`);
  q.push(`resale vs new apartment ${city}`);

  // Financial
  q.push(`home loan ${budgetStr} ${city} property`);
  q.push(`emi calculator ${city} ${propertyType}`);

  // Custom keywords
  for (const kw of keywords.slice(0, 3)) {
    q.push(`${kw} ${city} property`);
  }

  return [...new Set(q.filter(Boolean))];
}

export function isBuyerSignal(content: string): boolean {
  const lower = content.toLowerCase();
  return BUYER_INTENT_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()));
}

export function classifyBuyerIntentType(content: string, isNRI: boolean): 'buyer' | 'investor' | 'relocation' {
  const lower = content.toLowerCase();
  if (isNRI || /nri|returning to india|moving back|relocat|shifting to|coming from (dubai|us|uk|singapore|uae|canada)/i.test(content)) {
    return 'relocation';
  }
  if (/invest(ment|or|ing)|rental yield|capital appreciation|roi|rental income|appreciation/i.test(content)) {
    return 'investor';
  }
  return 'buyer';
}
