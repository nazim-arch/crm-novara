// app/api/intentradar/available-sources/route.ts
// Returns which source IDs and AI providers have API keys configured
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getApiKey } from '@/lib/intentradar/db';

// Map each source ID to the DB key names it requires
// Empty array = works without any key (public API)
const SOURCE_KEY_MAP: Record<string, string[]> = {
  youtube:          ['youtube'],
  reddit:           [],                  // public API, no key needed
  google_maps:      ['google_places'],
  instagram:        ['serp'],
  facebook:         ['serp'],
  linkedin:         ['serp'],
  telegram:         ['telegram_bot'],    // matches getApiKey('telegram_bot') in scrapers
  quora:            ['serp'],
  news:             ['serp'],
  financial_forums: ['serp'],
  portal_forums:    ['serp'],
};

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Check all unique keys in parallel
  const allKeys = [...new Set(Object.values(SOURCE_KEY_MAP).flat())];
  const keyResults = await Promise.all(allKeys.map(k => getApiKey(k)));
  const keyHasValue: Record<string, boolean> = {};
  allKeys.forEach((k, i) => { keyHasValue[k] = !!(keyResults[i]?.trim()); });

  const sources: Record<string, boolean> = {};
  for (const [sourceId, requiredKeys] of Object.entries(SOURCE_KEY_MAP)) {
    sources[sourceId] = requiredKeys.length === 0 || requiredKeys.every(k => keyHasValue[k]);
  }

  const [claudeKey, openaiKey] = await Promise.all([getApiKey('claude'), getApiKey('openai')]);

  return NextResponse.json({
    sources,
    ai: {
      claude: !!(claudeKey?.trim()),
      openai: !!(openaiKey?.trim()),
    },
  });
}
