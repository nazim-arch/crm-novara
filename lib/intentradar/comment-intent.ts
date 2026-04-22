// lib/intentradar/comment-intent.ts
// Detects buyer intent phrases in post captions and comment metadata

export const COMMENT_INTENT_PHRASES: string[] = [
  // Explicit interest
  'interested', 'very interested', 'seriously interested', 'keen',
  // Price inquiry
  'price?', 'rate?', 'how much', 'cost?', 'what is the price', 'what is rate',
  'pricing?', 'price please', 'rate please',
  // Details request
  'details please', 'more details', 'send details', 'share details',
  'more info', 'tell me more', 'can you share', 'want to know more',
  'brochure', 'floor plan', 'layout',
  // Contact signals
  'dm me', 'dm sent', 'check dms', 'whatsapp', 'contact number',
  'call me', 'your number', 'share number', 'pm me',
  // Location
  'location?', 'address?', 'where is this', 'which area', 'which locality',
  // Availability
  'available?', 'is it available', 'still available', 'any units left',
  'any availability', 'when available',
  // Buyer signals
  'looking for similar', 'interested buyer', 'serious buyer',
  'ready to buy', 'planning to buy', 'want to purchase',
  'budget match', 'suits my budget',
];

const COMPILED = COMMENT_INTENT_PHRASES.map(p => ({
  phrase: p,
  re: new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
}));

export function extractCommentIntentSignals(text: string): string[] {
  return COMPILED.filter(({ re }) => re.test(text)).map(({ phrase }) => phrase);
}

export function hasCommentBuyerIntent(text: string): boolean {
  return COMPILED.some(({ re }) => re.test(text));
}

// Extract engagement counts (likes, comments) from SerpAPI snippet text
export function extractEngagementCount(text: string): { likes?: number; comments?: number } {
  const result: { likes?: number; comments?: number } = {};
  const likeMatch = text.match(/(\d[\d,]*)\s*(?:likes?|Likes?|❤)/);
  const commentMatch = text.match(/(\d[\d,]*)\s*(?:comments?|Comments?)/);
  if (likeMatch) result.likes = parseInt(likeMatch[1].replace(/,/g, ''), 10);
  if (commentMatch) result.comments = parseInt(commentMatch[1].replace(/,/g, ''), 10);
  return result;
}

// Platforms where user identity cannot be reliably extracted
export const SIGNAL_PLATFORMS = new Set([
  'instagram', 'facebook', 'twitter', 'portal_forums',
]);

export function resolveLeadType(platform: string, authorHandle?: string): 'DIRECT' | 'SIGNAL' {
  if (SIGNAL_PLATFORMS.has(platform)) return 'SIGNAL';
  if (!authorHandle) return 'SIGNAL';
  return 'DIRECT';
}
