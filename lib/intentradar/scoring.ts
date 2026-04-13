// lib/intentradar/scoring.ts
// IntentRadar Scoring Engine — 10 dimensions, behavioral patterns, velocity detection

export interface RawSignal {
  platform: string;
  authorHandle?: string;
  authorName?: string;
  content: string;
  sourceUrl?: string;
  capturedAt: Date;
  sourceType: string; // comment | post | review | listing | query
  rawData?: any;
}

export interface ScoredLead {
  // Identity
  profileHandle: string | null;
  profileName: string | null;
  profileUrl: string | null;
  profilePlatform: string;

  // Source
  sourcePlatform: string;
  sourceUrl: string | null;
  sourceContent: string;
  sourceType: string;
  capturedAt: Date;

  // Scores
  totalScore: number;
  tier: 'hot' | 'warm' | 'cool' | 'watching';
  scoreSpecificity: number;
  scoreBudgetClarity: number;
  scoreUrgency: number;
  scoreEngagementVelocity: number;
  scoreDeveloperFollow: number;
  scoreContentCreator: number;
  scoreCrossPlatform: number;
  scoreFinancialReady: number;
  scoreLocationLock: number;
  scoreProfileMatch: number;

  // Inferred
  inferredBuyerType: string | null;
  inferredBudget: string | null;
  inferredLocation: string | null;
  inferredTimeline: string | null;
  isNRI: boolean;
  nriCountry: string | null;

  // Behavioral
  behavioralPatterns: string[];
  velocityPattern: string | null;
}

interface CampaignCriteria {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  buyerPersonas: string[];
  urgency: string;
}

// ─── KEYWORD BANKS ───
const BUDGET_PATTERNS = [
  /(\d+\.?\d*)\s*(cr|crore|crores)/i,
  /(\d+)\s*(lakh|lakhs|lac|lacs)/i,
  /budget\s*(is|of|around|under|below|above)?\s*[\u20b9₹]?\s*(\d+\.?\d*)\s*(cr|crore|lakh|l)/i,
  /under\s*(\d+\.?\d*)\s*(cr|crore)/i,
  /(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*(cr|crore)/i,
];

const URGENCY_KEYWORDS = {
  high: ['immediate', 'urgent', 'asap', 'this month', 'next month', 'moving soon', 'lease ending', 'possession ready', 'ready to move', 'pre-approved', 'loan approved', 'need by', 'shifting by', 'relocating soon'],
  medium: ['6 months', 'this year', 'by end of year', 'planning to', 'looking to buy', 'want to buy', 'interested in buying', 'planning to move', 'next year'],
  low: ['exploring', 'just checking', 'someday', 'thinking about', 'considering', 'maybe', 'not sure when'],
};

const NRI_KEYWORDS = ['nri', 'nre account', 'nro account', 'fema', 'dtaa', 'repatriation', 'moving back', 'returning to india', 'from us', 'from uk', 'from uae', 'from dubai', 'from singapore', 'from canada', 'from australia', 'bay area', 'silicon valley', 'power of attorney', 'poa', 'living abroad', 'based in us', 'based in uk', 'settled abroad'];

const NRI_COUNTRIES: Record<string, string> = {
  'us': 'USA', 'usa': 'USA', 'united states': 'USA', 'bay area': 'USA', 'silicon valley': 'USA', 'new york': 'USA', 'california': 'USA',
  'uk': 'UK', 'london': 'UK', 'manchester': 'UK', 'united kingdom': 'UK',
  'uae': 'UAE', 'dubai': 'UAE', 'abu dhabi': 'UAE', 'sharjah': 'UAE',
  'singapore': 'Singapore',
  'canada': 'Canada', 'toronto': 'Canada', 'vancouver': 'Canada',
  'australia': 'Australia', 'sydney': 'Australia', 'melbourne': 'Australia',
  'germany': 'Germany', 'berlin': 'Germany', 'munich': 'Germany',
};

const FINANCIAL_KEYWORDS = ['home loan', 'housing loan', 'emi', 'down payment', 'stamp duty', 'registration charges', 'gst on property', 'loan pre-approved', 'loan approved', 'bankbazaar', 'sbi home loan', 'hdfc home loan', 'icici home loan', 'interest rate', 'loan eligibility'];

const VASTU_KEYWORDS = ['vastu', 'east facing', 'north facing', 'east-facing', 'north-facing', 'pooja room', 'puja room', 'brahmasthan', 'south facing avoid', 'muhurat', 'auspicious', 'shubh'];

const COMPARISON_PATTERNS = [
  /(\w+)\s+vs\s+(\w+)/i,
  /compare|comparison|comparing|better\s+than|which\s+is\s+better/i,
  /pros\s+and\s+cons|advantages|disadvantages|downsides/i,
];

const LIFE_EVENT_KEYWORDS = {
  marriage: ['getting married', 'just married', 'wedding', 'newlywed', 'after marriage', 'couple looking'],
  baby: ['expecting', 'pregnant', 'baby on the way', 'new baby', 'newborn', 'family expanding', 'need bigger space', 'kids room'],
  job_change: ['new job', 'joining', 'relocating for work', 'job transfer', 'promoted', 'vp at', 'director at', 'senior role'],
  retirement: ['retiring', 'retirement', 'golden years', 'post retirement', 'retired'],
  school: ['school admission', 'good schools nearby', 'school proximity', 'kids education'],
};

const COMPLAINT_KEYWORDS = ['rent increase', 'landlord', 'rent is too high', 'maintenance issues', 'too small', 'no parking', 'traffic nightmare', 'commute is killing', 'water problem', 'power cuts', 'noisy neighbors'];

// ─── SCORING FUNCTIONS ───

function scoreSpecificity(content: string, criteria: CampaignCriteria): number {
  let score = 0;
  const lower = content.toLowerCase();

  // Check for BHK mention
  if (/\d\s*bhk/i.test(content)) score += 3;

  // Check for specific location mention
  for (const market of criteria.microMarkets) {
    if (lower.includes(market.toLowerCase())) { score += 4; break; }
  }
  if (lower.includes(criteria.city.toLowerCase())) score += 2;

  // Check for budget mention
  if (BUDGET_PATTERNS.some(p => p.test(content))) score += 3;

  // Check for property type
  if (lower.includes('apartment') || lower.includes('flat') || lower.includes('villa') || lower.includes('plot')) score += 2;

  // Check for RERA mention
  if (lower.includes('rera')) score += 2;

  // Check for facing/floor preference
  if (/east.?facing|north.?facing|high.?floor|low.?floor/i.test(content)) score += 1;

  return Math.min(score, 15);
}

function scoreBudgetClarity(content: string): number {
  let score = 0;
  const lower = content.toLowerCase();

  // Range mentioned (e.g., "2-3 Cr")
  if (/\d+\.?\d*\s*-\s*\d+\.?\d*\s*(cr|crore)/i.test(content)) score += 8;
  // Single budget (e.g., "under 3 Cr")
  else if (/under|below|within|budget\s+(is|of)?\s*\d/i.test(lower) && BUDGET_PATTERNS.some(p => p.test(content))) score += 6;
  // Just a number with cr/crore
  else if (BUDGET_PATTERNS.some(p => p.test(content))) score += 4;

  // "Can stretch" or "flexible" = has a range in mind
  if (/can stretch|flexible|max|maximum/i.test(content)) score += 2;

  // Exact down payment mention
  if (/down\s*payment|upfront/i.test(content)) score += 2;

  return Math.min(score, 12);
}

function scoreUrgency(content: string): number {
  let score = 0;
  const lower = content.toLowerCase();

  for (const kw of URGENCY_KEYWORDS.high) {
    if (lower.includes(kw)) { score += 8; break; }
  }
  if (score === 0) {
    for (const kw of URGENCY_KEYWORDS.medium) {
      if (lower.includes(kw)) { score += 5; break; }
    }
  }
  if (score === 0) {
    for (const kw of URGENCY_KEYWORDS.low) {
      if (lower.includes(kw)) { score += 2; break; }
    }
  }

  // Specific date/month mentioned
  if (/by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|202[5-9])/i.test(content)) score += 3;

  // Site visit request
  if (/site\s*visit|sample\s*flat|model\s*flat|can\s*i\s*visit|show\s*me/i.test(content)) score += 3;

  return Math.min(score, 12);
}

function scoreFinancialReadiness(content: string): number {
  let score = 0;
  const lower = content.toLowerCase();

  let matches = 0;
  for (const kw of FINANCIAL_KEYWORDS) {
    if (lower.includes(kw)) matches++;
  }
  score += Math.min(matches * 3, 8);

  if (/pre.?approved|sanctioned|eligible/i.test(content)) score += 3;

  return Math.min(score, 10);
}

function scoreLocationLock(content: string, criteria: CampaignCriteria): number {
  let score = 0;
  const lower = content.toLowerCase();

  let marketsMatched = 0;
  for (const market of criteria.microMarkets) {
    if (lower.includes(market.toLowerCase())) marketsMatched++;
  }

  if (marketsMatched >= 3) score += 3; // Too many = still exploring
  else if (marketsMatched === 2) score += 6;
  else if (marketsMatched === 1) score += 8; // Single market = locked

  // Specific landmark/road/area mention
  if (/main\s*road|cross|layout|stage|phase|sector|block/i.test(content)) score += 2;

  return Math.min(score, 8);
}

function detectNRI(content: string): { isNRI: boolean; country: string | null } {
  const lower = content.toLowerCase();

  for (const kw of NRI_KEYWORDS) {
    if (lower.includes(kw)) {
      // Try to detect country
      for (const [key, country] of Object.entries(NRI_COUNTRIES)) {
        if (lower.includes(key)) return { isNRI: true, country };
      }
      return { isNRI: true, country: null };
    }
  }
  return { isNRI: false, country: null };
}

function detectBehavioralPatterns(content: string): string[] {
  const patterns: string[] = [];
  const lower = content.toLowerCase();

  // Life events
  for (const [event, keywords] of Object.entries(LIFE_EVENT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      patterns.push(`life_event:${event}`);
    }
  }

  // Vastu
  if (VASTU_KEYWORDS.some(kw => lower.includes(kw))) patterns.push('vastu');

  // Comparison
  if (COMPARISON_PATTERNS.some(p => p.test(content))) patterns.push('comparison');

  // Proxy buying ("for my parents", "helping friend")
  if (/for\s+my\s+(parents?|brother|sister|friend|family)|helping\s+(my|a)\s+(friend|relative)/i.test(content)) {
    patterns.push('proxy_buyer');
  }

  // Complaints
  if (COMPLAINT_KEYWORDS.some(kw => lower.includes(kw))) patterns.push('complaint_trigger');

  // FOMO
  if (/prices?\s+(going|only)\s+up|too\s+late|missing\s+out|should\s+i\s+buy\s+now|last\s+few\s+units/i.test(content)) {
    patterns.push('fomo');
  }

  // Content depth (long comment = serious)
  if (content.length > 300) patterns.push('deep_engagement');

  return patterns;
}

function extractBudget(content: string): string | null {
  // Try range first
  const rangeMatch = content.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*(cr|crore)/i);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]} Cr`;

  // Single value
  const singleMatch = content.match(/(\d+\.?\d*)\s*(cr|crore)/i);
  if (singleMatch) return `${singleMatch[1]} Cr`;

  const lakhMatch = content.match(/(\d+)\s*(lakh|lakhs|lac)/i);
  if (lakhMatch) return `${lakhMatch[1]} Lakhs`;

  return null;
}

function extractLocations(content: string, criteria: CampaignCriteria): string | null {
  const found: string[] = [];
  const lower = content.toLowerCase();

  for (const market of criteria.microMarkets) {
    if (lower.includes(market.toLowerCase())) found.push(market);
  }
  if (found.length > 0) return found.join(', ');

  if (lower.includes(criteria.city.toLowerCase())) return criteria.city;

  return null;
}

function inferBuyerType(content: string, isNRI: boolean, patterns: string[]): string | null {
  if (isNRI) return 'nri';

  const lower = content.toLowerCase();
  if (/invest(ment|or|ing)|rental\s*yield|appreciation|roi|capital\s*gain/i.test(content)) return 'investor';
  if (/upgrad(e|ing)|bigger\s*(space|home|flat)|family\s*expand/i.test(content)) return 'upgrade_buyer';
  if (/first\s*(home|time|house)|never\s*bought|new\s*buyer/i.test(content)) return 'first_time';
  if (patterns.some(p => p.includes('life_event'))) return 'end_user';

  return 'end_user';
}

// ─── MAIN SCORING FUNCTION ───
export function scoreSignal(signal: RawSignal, criteria: CampaignCriteria): ScoredLead {
  const content = signal.content;

  // Score each dimension
  const specs = scoreSpecificity(content, criteria);
  const budget = scoreBudgetClarity(content);
  const urgency = scoreUrgency(content);
  const financial = scoreFinancialReadiness(content);
  const location = scoreLocationLock(content, criteria);

  // These require cross-platform data (set to base for single signal)
  const velocity = content.length > 200 ? 7 : content.length > 100 ? 4 : 2; // proxy from content depth
  const devFollow = 0; // requires Instagram/social data
  const creatorFollow = 0; // requires subscription data
  const crossPlatform = 0; // requires identity resolution
  const profileMatch = 5; // default mid-score

  // Detect patterns
  const nriResult = detectNRI(content);
  const patterns = detectBehavioralPatterns(content);

  // Pattern bonuses
  let bonus = 0;
  if (patterns.includes('comparison')) bonus += 4;
  if (patterns.includes('vastu')) bonus += 5;
  if (patterns.some(p => p.startsWith('life_event'))) bonus += 4;
  if (patterns.includes('deep_engagement')) bonus += 3;
  if (patterns.includes('complaint_trigger')) bonus += 3;
  if (nriResult.isNRI) bonus += 5;

  // Calculate total (weighted)
  const weighted = Math.round(
    specs +           // 15%
    budget +          // 12%
    urgency +         // 12%
    velocity +        // 14% (proxy)
    devFollow +       // 10%
    creatorFollow +   // 10%
    crossPlatform +   // 10%
    financial +       // 10%
    location +        // 8%
    profileMatch * 0.05 + // 5%
    bonus
  );

  const totalScore = Math.min(Math.max(weighted, 0), 100);

  // Determine tier
  let tier: 'hot' | 'warm' | 'cool' | 'watching';
  if (totalScore >= 80) tier = 'hot';
  else if (totalScore >= 50) tier = 'warm';
  else if (totalScore >= 25) tier = 'cool';
  else tier = 'watching';

  return {
    profileHandle: signal.authorHandle || null,
    profileName: signal.authorName || null,
    profileUrl: null,
    profilePlatform: signal.platform,
    sourcePlatform: signal.platform,
    sourceUrl: signal.sourceUrl || null,
    sourceContent: content,
    sourceType: signal.sourceType,
    capturedAt: signal.capturedAt,
    totalScore,
    tier,
    scoreSpecificity: specs,
    scoreBudgetClarity: budget,
    scoreUrgency: urgency,
    scoreEngagementVelocity: velocity,
    scoreDeveloperFollow: devFollow,
    scoreContentCreator: creatorFollow,
    scoreCrossPlatform: crossPlatform,
    scoreFinancialReady: financial,
    scoreLocationLock: location,
    scoreProfileMatch: profileMatch,
    inferredBuyerType: inferBuyerType(content, nriResult.isNRI, patterns),
    inferredBudget: extractBudget(content),
    inferredLocation: extractLocations(content, criteria),
    inferredTimeline: URGENCY_KEYWORDS.high.some(kw => content.toLowerCase().includes(kw)) ? 'Immediate' :
                      URGENCY_KEYWORDS.medium.some(kw => content.toLowerCase().includes(kw)) ? '3-6 months' :
                      'Exploring',
    isNRI: nriResult.isNRI,
    nriCountry: nriResult.country,
    behavioralPatterns: patterns,
    velocityPattern: null, // requires historical data
  };
}

export function tierLabel(tier: string): string {
  return { hot: '🔥 HOT', warm: '🟡 WARM', cool: '🟢 COOL', watching: '⚪ WATCHING' }[tier] || tier;
}

export function tierColor(tier: string): string {
  return { hot: '#ef4444', warm: '#f59e0b', cool: '#22c55e', watching: '#94a3b8' }[tier] || '#94a3b8';
}
