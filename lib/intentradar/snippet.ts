// lib/intentradar/snippet.ts
// Extracts a short, human-readable evidence snippet from raw signal content.
// Answers the question: "Why is this lead here?" without opening the full record.
// Output is plain text — no HTML, no markdown, safe to render directly.

const MAX_LENGTH = 140;

// Keywords that indicate high-signal sentences worth surfacing
const SIGNAL_KEYWORDS = [
  /\d+\.?\d*\s*(cr|crore|lakh)/i,        // budget
  /\d\s*bhk/i,                            // config
  /buy|purchase|invest|looking\s+for/i,   // intent
  /urgent|asap|immediately|soon|ready/i,  // urgency
  /home\s+loan|emi|pre.?approved/i,       // financial readiness
  /east.?facing|north.?facing|vastu/i,    // preference
  /relocat|moving\s+back|returning/i,     // life event
  /nri|settled\s+abroad|based\s+in/i,     // NRI signal
];

function sentenceScore(sentence: string): number {
  return SIGNAL_KEYWORDS.reduce((acc, re) => acc + (re.test(sentence) ? 1 : 0), 0);
}

function sanitize(text: string): string {
  // Strip HTML tags, collapse whitespace, trim
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractSnippet(content: string, maxLength = MAX_LENGTH): string {
  if (!content) return 'No signal content available.';

  const clean = sanitize(content);

  // Split on sentence-ending punctuation
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 20);

  if (sentences.length === 0) {
    return clean.length <= maxLength ? clean : clean.slice(0, maxLength - 1) + '…';
  }

  // Pick the sentence with the highest signal-keyword density
  const best = sentences
    .map(s => ({ s, score: sentenceScore(s) }))
    .sort((a, b) => b.score - a.score)[0].s;

  if (best.length <= maxLength) return best;
  return best.slice(0, maxLength - 1) + '…';
}
