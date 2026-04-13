import { inngest } from './client';
import { prisma, updateCampaignStatus, logSignal } from '@/lib/intentradar/db';
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

    // Step 1: Run all scrapers
    const rawSignals = await step.run('run-scrapers', async () => {
      await updateCampaignStatus(campaignId, 'running', { startedAt: new Date() });
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

    // Step 4: AI insights + persist leads
    await step.run('save-leads-with-insights', async () => {
      for (const lead of scoredLeads) {
        let aiInsights = {
          claudeInsight: null as string | null,
          gptInsight: null as string | null,
          recommendedAction: '',
          responseDraft: '',
          whyStrong: '',
        };

        if (lead.tier === 'hot' || lead.tier === 'warm') {
          try {
            aiInsights = await generateAIInsights(lead, campaignContext);
          } catch {
            // non-fatal — save lead without AI insight
          }
        } else {
          aiInsights.recommendedAction = lead.tier === 'cool'
            ? 'Add to nurture sequence. Monitor for signal escalation.'
            : 'Passive monitoring only.';
          aiInsights.whyStrong = lead.behavioralPatterns.length > 0
            ? `Patterns: ${lead.behavioralPatterns.join(', ')}`
            : 'Basic interest signal detected';
        }

        await prisma.ir_lead.create({
          data: {
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
          },
        });
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
