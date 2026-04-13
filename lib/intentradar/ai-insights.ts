// lib/intentradar/ai-insights.ts
// Dual AI Insights Engine — Claude + OpenAI GPT
// Generates comprehensive buyer analysis, recommended actions, and response drafts

import { getApiKey } from './db';

interface LeadForAnalysis {
  sourceContent: string;
  sourcePlatform: string;
  totalScore: number;
  tier: string;
  inferredBuyerType: string | null;
  inferredBudget: string | null;
  inferredLocation: string | null;
  inferredTimeline: string | null;
  isNRI: boolean;
  nriCountry: string | null;
  behavioralPatterns: string[];
  scoreSpecificity: number;
  scoreBudgetClarity: number;
  scoreUrgency: number;
  scoreFinancialReady: number;
  scoreLocationLock: number;
}

interface CampaignContext {
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
}

interface AIInsightsResult {
  claudeInsight: string | null;
  gptInsight: string | null;
  recommendedAction: string;
  responseDraft: string;
  whyStrong: string;
}

const SYSTEM_PROMPT = `You are IntentRadar AI — an expert real estate buyer intent analyst specializing in the Indian property market. You analyze buyer signals from digital sources and provide actionable intelligence for sales teams.

Your analysis must be:
- Specific and actionable (not generic advice)
- Grounded in Indian real estate buyer psychology
- Sensitive to NRI buyer patterns and needs
- Direct and concise — sales teams need clarity, not essays

Output format (use these exact headers):

**BUYER PROFILE:**
[2-3 sentences: who is this person, what stage of buying journey, buyer type]

**WHY THIS IS A STRONG LEAD:**
[3-5 bullet points: specific signals that indicate genuine buying intent]

**RISK FACTORS:**
[1-3 bullet points: what could go wrong, what to watch for]

**RECOMMENDED APPROACH:**
[Step-by-step: exactly what the sales team should do, in what order, with timing]

**SUGGESTED RESPONSE:**
[A ready-to-use, natural response message for the platform where the signal was found. Must feel human, not robotic. Value-first, not sales-first.]

**DO NOT:**
[1-2 things to specifically avoid with this lead]`;

function buildPrompt(lead: LeadForAnalysis, campaign: CampaignContext): string {
  return `Analyze this real estate buyer lead and provide actionable intelligence:

SIGNAL SOURCE: ${lead.sourcePlatform}
COMMENT/POST: "${lead.sourceContent}"

SCORING RESULTS:
- Total Score: ${lead.totalScore}/100 (Tier: ${lead.tier.toUpperCase()})
- Specificity: ${lead.scoreSpecificity}/15
- Budget Clarity: ${lead.scoreBudgetClarity}/12
- Urgency: ${lead.scoreUrgency}/12
- Financial Readiness: ${lead.scoreFinancialReady}/10
- Location Lock: ${lead.scoreLocationLock}/8

INFERRED ATTRIBUTES:
- Buyer Type: ${lead.inferredBuyerType || 'Unknown'}
- Budget: ${lead.inferredBudget || 'Not mentioned'}
- Location: ${lead.inferredLocation || 'Not specified'}
- Timeline: ${lead.inferredTimeline || 'Unknown'}
- NRI: ${lead.isNRI ? `Yes (${lead.nriCountry || 'country unknown'})` : 'No'}
- Behavioral Patterns: ${lead.behavioralPatterns.length > 0 ? lead.behavioralPatterns.join(', ') : 'None detected'}

CAMPAIGN CONTEXT (what we're selling):
- City: ${campaign.city}
- Target Areas: ${campaign.microMarkets.join(', ')}
- Budget Range: ${campaign.budgetMin}-${campaign.budgetMax} Cr
- Property Type: ${campaign.propertyType}${campaign.bhkConfig ? ` (${campaign.bhkConfig})` : ''}

Provide your analysis following the format in your instructions.`;
}

// ─── CLAUDE AI ───
async function getClaudeInsight(lead: LeadForAnalysis, campaign: CampaignContext): Promise<string | null> {
  const apiKey = await getApiKey('claude');
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(lead, campaign) }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.content?.[0]?.text || null;
  } catch (err) {
    console.error('Claude API call failed:', err);
    return null;
  }
}

// ─── OPENAI GPT ───
async function getGPTInsight(lead: LeadForAnalysis, campaign: CampaignContext): Promise<string | null> {
  const apiKey = await getApiKey('openai');
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(lead, campaign) },
        ],
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('OpenAI API call failed:', err);
    return null;
  }
}

// ─── PARSE AI OUTPUT ───
function parseAIOutput(text: string): {
  whyStrong: string;
  recommendedAction: string;
  responseDraft: string;
} {
  const sections: Record<string, string> = {};
  const sectionRegex = /\*\*([^*]+)\*\*:?\s*/g;
  let lastKey = '';
  let lastIndex = 0;

  let match;
  const matches: { key: string; index: number }[] = [];

  while ((match = sectionRegex.exec(text)) !== null) {
    matches.push({ key: match[1].trim(), index: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].key.length - 4 : text.length;
    sections[matches[i].key.toUpperCase()] = text.slice(matches[i].index, end).trim();
  }

  return {
    whyStrong: sections['WHY THIS IS A STRONG LEAD'] || sections['WHY STRONG'] || '',
    recommendedAction: sections['RECOMMENDED APPROACH'] || sections['RECOMMENDED ACTION'] || '',
    responseDraft: sections['SUGGESTED RESPONSE'] || sections['RESPONSE DRAFT'] || '',
  };
}

// ─── MAIN FUNCTION ───
export async function generateAIInsights(
  lead: LeadForAnalysis,
  campaign: CampaignContext,
  providers: ('claude' | 'gpt')[] = ['claude', 'gpt']
): Promise<AIInsightsResult> {
  const results: AIInsightsResult = {
    claudeInsight: null,
    gptInsight: null,
    recommendedAction: '',
    responseDraft: '',
    whyStrong: '',
  };

  // Run both AI calls in parallel
  const promises: Promise<void>[] = [];

  if (providers.includes('claude')) {
    promises.push(
      getClaudeInsight(lead, campaign).then(insight => {
        results.claudeInsight = insight;
        if (insight) {
          const parsed = parseAIOutput(insight);
          // Claude is primary for action recommendations
          results.recommendedAction = parsed.recommendedAction;
          results.responseDraft = parsed.responseDraft;
          results.whyStrong = parsed.whyStrong;
        }
      })
    );
  }

  if (providers.includes('gpt')) {
    promises.push(
      getGPTInsight(lead, campaign).then(insight => {
        results.gptInsight = insight;
        // If Claude didn't work, fall back to GPT
        if (!results.recommendedAction && insight) {
          const parsed = parseAIOutput(insight);
          results.recommendedAction = parsed.recommendedAction;
          results.responseDraft = parsed.responseDraft;
          results.whyStrong = parsed.whyStrong;
        }
      })
    );
  }

  await Promise.all(promises);

  // If neither AI worked, generate basic recommendation
  if (!results.recommendedAction) {
    results.recommendedAction = generateFallbackAction(lead);
    results.whyStrong = generateFallbackWhyStrong(lead);
    results.responseDraft = 'AI insights unavailable — please check API keys in Settings.';
  }

  return results;
}

function generateFallbackAction(lead: LeadForAnalysis): string {
  if (lead.tier === 'hot') return 'Immediate outreach within 2 hours. Personal call + WhatsApp with 2-3 curated options matching their criteria.';
  if (lead.tier === 'warm') return 'Engage within 24 hours. Reply on the platform with genuine value, then DM with relevant options.';
  if (lead.tier === 'cool') return 'Add to nurture sequence. Weekly value content about their area of interest.';
  return 'Passive monitoring. Re-score if new signals emerge.';
}

function generateFallbackWhyStrong(lead: LeadForAnalysis): string {
  const reasons: string[] = [];
  if (lead.scoreBudgetClarity > 5) reasons.push('Budget specified clearly');
  if (lead.scoreUrgency > 5) reasons.push('Shows urgency signals');
  if (lead.scoreLocationLock > 4) reasons.push('Location preference locked');
  if (lead.isNRI) reasons.push('NRI buyer detected');
  if (lead.scoreFinancialReady > 4) reasons.push('Financial preparation signals');
  if (lead.behavioralPatterns.length > 0) reasons.push(`Behavioral patterns: ${lead.behavioralPatterns.join(', ')}`);
  return reasons.length > 0 ? reasons.join(' | ') : 'Basic interest signal detected';
}

export default generateAIInsights;
