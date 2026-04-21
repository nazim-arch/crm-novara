import { inngest } from './client';
import { prisma, updateCampaignStatus, logSignal, getApiKey } from '@/lib/intentradar/db';
import { runAllScrapers } from '@/lib/intentradar/scrapers';
import { scoreSignal } from '@/lib/intentradar/scoring';
import { generateAIInsights } from '@/lib/intentradar/ai-insights';

export type GenerateLeadsEventData = {
  campaignId: string;
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig: string | null;
  buyerPersonas: string[];
  urgency: string;
  sources: string[];
  keywords: string[];
};

export const generateLeadsFunction = inngest.createFunction(
  {
    id: 'intentradar-generate-leads',
    name: 'IntentRadar: Generate Leads',
    retries: 1,
    triggers: { event: 'intentradar/generate.requested' },
  },
  async ({ event, step }) => {
    const data = event.data as GenerateLeadsEventData;
    const {
      campaignId,
      city, microMarkets, budgetMin, budgetMax,
      propertyType, bhkConfig, buyerPersonas, urgency,
      sources, keywords,
    } = data;

    const scraperConfig = {
      city, microMarkets, budgetMin, budgetMax,
      propertyType,
      bhkConfig: bhkConfig ?? undefined,
      buyerPersonas, urgency, keywords,
    };

    // Step 1: Log key availability, then run all scrapers
    const rawSignals = await step.run('run-scrapers', async () => {
      await updateCampaignStatus(campaignId, 'running', { startedAt: new Date() });

      // Log which API keys are configured so we can debug missing sources
      const keyChecks = await Promise.all([
        getApiKey('youtube').then(v => ({ key: 'youtube', has: !!v })),
        getApiKey('serp').then(v => ({ key: 'serp', has: !!v })),
        getApiKey('google_places').then(v => ({ key: 'google_places', has: !!v })),
        getApiKey('reddit_client_id').then(v => ({ key: 'reddit_client_id', has: !!v })),
        getApiKey('claude').then(v => ({ key: 'claude', has: !!v })),
        getApiKey('openai').then(v => ({ key: 'openai', has: !!v })),
      ]);
      console.log('[IntentRadar] API key status:', keyChecks.map(k => `${k.key}=${k.has ? 'YES' : 'NO'}`).join(' | '));
      console.log('[IntentRadar] Sources requested:', sources.join(', '));

      return runAllScrapers(scraperConfig, sources);
    });

    // Step 2: Log raw signals to DB
    await step.run('log-signals', async () => {
      for (const signal of rawSignals) {
        await logSignal({
          campaignId,
          platform: signal.platform,
          authorHandle: signal.authorHandle,
          authorName: signal.authorName,
          content: signal.content,
          sourceUrl: signal.sourceUrl,
          rawData: signal.rawData,
        });
      }
    });

    // Step 3: Score and save leads
    // step.run() JSON-serialises its return value — re-hydrate Date fields
    const scoredLeads = rawSignals
      .map(signal => ({ ...signal, capturedAt: new Date(signal.capturedAt) }))
      .map(signal => scoreSignal(signal, scraperConfig))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 50);

    const campaignContext = { city, microMarkets, budgetMin, budgetMax, propertyType, bhkConfig: bhkConfig ?? undefined };

    // Step 4: AI insights + persist leads (with cross-run deduplication)
    await step.run('save-leads-with-insights', async () => {
      for (const lead of scoredLeads) {
        let aiInsights = {
          claudeInsight: null as string | null,
          gptInsight: null as string | null,
          recommendedAction: '',
          responseDraft: '',
          whyStrong: '',
        };

        try {
          aiInsights = await generateAIInsights(lead, campaignContext);
        } catch {
          // non-fatal — save lead without AI insight
        }

        const scoreFields = {
          totalScore: lead.totalScore,
          tier: lead.tier,
          scoreSpecificity: lead.scoreSpecificity,
          scoreBudgetClarity: lead.scoreBudgetClarity,
          scoreUrgency: lead.scoreUrgency,
          scoreEngagementVelocity: lead.scoreEngagementVelocity,
          scoreDeveloperFollow: lead.scoreDeveloperFollow,
          scoreContentCreator: lead.scoreContentCreator,
          scoreCrossPlatform: lead.scoreCrossPlatform,
          scoreFinancialReady: lead.scoreFinancialReady,
          scoreLocationLock: lead.scoreLocationLock,
          scoreProfileMatch: lead.scoreProfileMatch,
          inferredBuyerType: lead.inferredBuyerType,
          inferredBudget: lead.inferredBudget,
          inferredLocation: lead.inferredLocation,
          inferredTimeline: lead.inferredTimeline,
          isNRI: lead.isNRI,
          nriCountry: lead.nriCountry,
          aiInsightClaude: aiInsights.claudeInsight,
          aiInsightGPT: aiInsights.gptInsight,
          aiRecommendedAction: aiInsights.recommendedAction,
          aiResponseDraft: aiInsights.responseDraft,
          aiWhyStrong: aiInsights.whyStrong,
          behavioralPatterns: lead.behavioralPatterns,
          velocityPattern: lead.velocityPattern,
        };

        const createData = {
          campaignId,
          profileHandle: lead.profileHandle,
          profileName: lead.profileName,
          profileUrl: lead.profileUrl,
          profilePlatform: lead.profilePlatform,
          sourcePlatform: lead.sourcePlatform,
          sourceUrl: lead.sourceUrl,
          sourceContent: lead.sourceContent,
          sourceType: lead.sourceType,
          capturedAt: lead.capturedAt,
          ...scoreFields,
        };

        if (lead.profileHandle) {
          // Known profile: upsert on the compound unique key (DB-enforced)
          await prisma.ir_lead.upsert({
            where: {
              profileHandle_sourcePlatform_campaignId: {
                profileHandle: lead.profileHandle,
                sourcePlatform: lead.sourcePlatform,
                campaignId,
              },
            },
            update: scoreFields,
            create: createData,
          });
        } else {
          // Anonymous signal: match on content prefix to avoid duplicates
          const contentPrefix = lead.sourceContent.slice(0, 100);
          const existing = await prisma.ir_lead.findFirst({
            where: {
              campaignId,
              sourcePlatform: lead.sourcePlatform,
              sourceContent: { startsWith: contentPrefix },
            },
            select: { id: true },
          });

          if (existing) {
            await prisma.ir_lead.update({ where: { id: existing.id }, data: scoreFields });
          } else {
            await prisma.ir_lead.create({ data: createData });
          }
        }
      }
    });

    // Step 5: Mark campaign complete
    await step.run('complete-campaign', async () => {
      const counts = {
        hot: scoredLeads.filter(l => l.tier === 'hot').length,
        warm: scoredLeads.filter(l => l.tier === 'warm').length,
        cool: scoredLeads.filter(l => l.tier === 'cool').length,
      };
      await updateCampaignStatus(campaignId, 'completed', {
        completedAt: new Date(),
        totalLeads: scoredLeads.length,
        hotLeads: counts.hot,
        warmLeads: counts.warm,
        coolLeads: counts.cool,
      });
    });

    return { campaignId, totalLeads: scoredLeads.length };
  }
);
