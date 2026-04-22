// lib/intentradar/scoring-helpers.ts
// Shared helpers extracted from scoring.ts for use in the pipeline

const NRI_KEYWORDS = ['nri', 'nre account', 'nro account', 'fema', 'dtaa', 'repatriation', 'moving back', 'returning to india', 'from us', 'from uk', 'from uae', 'from dubai', 'from singapore', 'from canada', 'from australia', 'bay area', 'silicon valley', 'power of attorney', 'poa', 'living abroad', 'based in us', 'based in uk', 'settled abroad'];

const NRI_COUNTRIES: Record<string, string> = {
  'us': 'USA', 'usa': 'USA', 'united states': 'USA', 'bay area': 'USA', 'silicon valley': 'USA',
  'uk': 'UK', 'london': 'UK', 'united kingdom': 'UK',
  'uae': 'UAE', 'dubai': 'UAE', 'abu dhabi': 'UAE', 'sharjah': 'UAE',
  'singapore': 'Singapore',
  'canada': 'Canada', 'toronto': 'Canada', 'vancouver': 'Canada',
  'australia': 'Australia', 'sydney': 'Australia', 'melbourne': 'Australia',
  'germany': 'Germany', 'berlin': 'Germany', 'munich': 'Germany',
};

export function detectNRI(content: string): { isNRI: boolean; country: string | null } {
  const lower = content.toLowerCase();
  for (const kw of NRI_KEYWORDS) {
    if (lower.includes(kw)) {
      for (const [key, country] of Object.entries(NRI_COUNTRIES)) {
        if (lower.includes(key)) return { isNRI: true, country };
      }
      return { isNRI: true, country: null };
    }
  }
  return { isNRI: false, country: null };
}
