// lib/intentradar/modes/seller.ts
// SELLER mode: query generation, intent signals, source rules

export const SELLER_ALLOWED_SOURCES = new Set([
  'openai_generate_seller',
  'portal_listings',
  '99acres', 'magicbricks', 'housing', 'nobroker', 'squareyards',
]);

export const SELLER_EXCLUDED_SOURCES = new Set([
  'youtube', 'reddit', 'quora', 'financial_forums', 'telegram',
  'instagram', 'facebook', 'linkedin', 'news', 'openai_generate',
]);

export const SELLER_INTENT_PHRASES = [
  'flat for sale', 'apartment for sale', 'villa for sale', 'plot for sale',
  'property for sale', 'owner selling', 'direct owner', 'resale flat', 'resale apartment',
  'urgent sale', 'distress sale', 'need to sell', 'want to sell', 'selling my apartment',
  'broker listing', 'agent listing', 'inventory available', 'units available',
  'new launch', 'pre-launch', 'price starts from', 'site visit available', 'book now',
  'limited units', 'ready to move', 'possession soon', 'under construction',
  'investment resale', 'builder inventory', 'channel partner', 'exclusive mandate',
  'premium listing', 'sale', 'for sale', 'sqft', 'carpet area', 'builtup area',
  'possession', 'rera registered', 'contact for price', 'price on request',
];

export function buildSellerQueries(config: {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  keywords: string[];
}): string[] {
  const q: string[] = [];
  const { city, microMarkets, propertyType, bhkConfig, budgetMin, budgetMax, keywords } = config;
  const bhk = bhkConfig || '';
  const budgetStr = `${budgetMin}-${budgetMax} crore`;

  // Core listing queries — portal-based
  q.push(`${bhk} ${propertyType} for sale ${city}`.trim());
  q.push(`resale ${bhk} ${propertyType} ${city} ${budgetStr}`.trim());
  q.push(`owner direct sale ${propertyType} ${city}`);
  q.push(`urgent sale ${propertyType} ${city}`);
  q.push(`new launch ${propertyType} ${city} ${budgetStr}`);
  q.push(`ready to move ${propertyType} ${city}`);
  q.push(`builder inventory ${propertyType} ${city}`);

  // Site-specific for SerpAPI
  q.push(`site:99acres.com "${city}" ${propertyType} for sale ${budgetStr}`);
  q.push(`site:magicbricks.com "${city}" ${bhk} ${propertyType} for sale`.trim());
  q.push(`site:housing.com "${city}" ${propertyType} sale`);
  q.push(`site:nobroker.in "${city}" ${propertyType} for sale owner`);
  q.push(`site:squareyards.com "${city}" ${propertyType} for sale`);

  // Location-specific
  for (const market of microMarkets.slice(0, 4)) {
    q.push(`${bhk} ${propertyType} for sale ${market} ${city}`.trim());
    q.push(`resale flat ${market} ${city} ${budgetStr}`);
  }

  // Seller type queries
  q.push(`direct owner ${propertyType} ${city} no brokerage`);
  q.push(`developer project launch ${city} ${propertyType}`);
  q.push(`channel partner listing ${propertyType} ${city}`);

  // Custom keywords
  for (const kw of keywords.slice(0, 3)) {
    q.push(`${kw} ${city} for sale`);
  }

  return [...new Set(q.filter(Boolean))];
}

export function isSellerSignal(content: string): boolean {
  const lower = content.toLowerCase();
  return SELLER_INTENT_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()));
}

export function classifySellerType(content: string): 'owner' | 'broker' | 'developer' {
  const lower = content.toLowerCase();
  if (/new launch|pre-launch|builder|developer|project|possession date|construction|rera/i.test(content)) {
    return 'developer';
  }
  if (/broker|agent|channel partner|brokerage|commission|mandate|exclusive/i.test(content)) {
    return 'broker';
  }
  return 'owner';
}

export function extractListingPrice(content: string): string | null {
  // Range: "2-3 Cr" or "2 to 3 crore"
  const rangeMatch = content.match(/(\d+\.?\d*)\s*(?:to|-)\s*(\d+\.?\d*)\s*(cr|crore|crores)/i);
  if (rangeMatch) return `₹${rangeMatch[1]}–${rangeMatch[2]} Cr`;

  // Single value: "2.5 Cr"
  const crMatch = content.match(/(?:₹|rs\.?|inr)?\s*(\d+\.?\d*)\s*(cr|crore|crores)/i);
  if (crMatch) return `₹${crMatch[1]} Cr`;

  // Lakhs
  const lakhMatch = content.match(/(?:₹|rs\.?|inr)?\s*(\d+)\s*(lakh|lakhs|lac|lacs)/i);
  if (lakhMatch) return `₹${lakhMatch[1]} L`;

  // "Price starts from"
  const startsMatch = content.match(/(?:price|starts?|starting)\s*(?:from|at|@)?\s*(?:₹|rs\.?)?\s*(\d+\.?\d*)\s*(cr|crore|lakh)/i);
  if (startsMatch) return `From ₹${startsMatch[1]} ${startsMatch[2].toLowerCase().startsWith('c') ? 'Cr' : 'L'}`;

  return null;
}
