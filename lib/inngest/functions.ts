import { inngest } from './client';
import { prisma, updateCampaignStatus, logSignal, getApiKey } from '@/lib/intentradar/db';
import { runAllScrapers } from '@/lib/intentradar/scrapers';
import { scoreSignal } from '@/lib/intentradar/scoring';
import { generateAIInsights } from '@/lib/intentradar/ai-insights';
import { computeFreshnessScore, computeRankWeight } from '@/lib/intentradar/freshness';
import { deduplicateBatch } from '@/lib/intentradar/dedupe';
import { extractSnippet } from '@/lib/intentradar/snippet';

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

    const campaignContext = {
      city, microMarkets, budgetMin, budgetMax,
      propertyType, bhkConfig: bhkConfig ?? undefined,
    };

    try {

      // Step 1: Run all scrapers
      const rawSignals = await step.run('run-scrapers', async () => {
        await updateCampaignStatus(campaignId, 'running', { startedAt: new Date() });

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

      // Step 2: Log raw signals (audit trail)
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

      // Step 3: Score, dedupe, freshness-rank (pure computation, no DB)
      const now = new Date();
      const freshnessScore = computeFreshnessScore(now);

      const scoredLeads = rawSignals
        .map(signal => ({ ...signal, capturedAt: new Date(signal.capturedAt) }))
        .map(signal => ({
          ...scoreSignal(signal, scraperConfig),
          originType: (signal.originType ?? 'real') as 'real' | 'synthetic',
          evidenceSnippet: extractSnippet(signal.content),
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 25);

      const dedupeInput = scoredLeads.map((l, idx) => ({
        id: String(idx),
        profileHandle: l.profileHandle,
        sourcePlatform: l.sourcePlatform,
        sourceContent: l.sourceContent,
        inferredBudget: l.inferredBudget,
        inferredLocation: l.inferredLocation,
        isNRI: l.isNRI,
        leadOriginType: l.originType,
        clusterId: null,
      }));
      const dedupeResults = deduplicateBatch(dedupeInput);

      const ranked = scoredLeads
        .map((lead, idx) => ({
          ...lead,
          ...dedupeResults.get(String(idx)),
          freshnessScore,
        }))
        .sort((a, b) =>
          computeRankWeight(b.totalScore, b.freshnessScore!, b.dedupeDecision ?? null) -
          computeRankWeight(a.totalScore, a.freshnessScore!, a.dedupeDecision ?? null)
        );

      // Step 4: Save all leads WITHOUT AI insights (fast — just DB writes)
      const savedLeadIds = await step.run('save-leads', async () => {
        const ids: Array<{ id: string; idx: number }> = [];

        for (let i = 0; i < ranked.length; i++) {
          const lead = ranked[i];

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
            behavioralPatterns: lead.behavioralPatterns,
            velocityPattern: lead.velocityPattern,
            leadOriginType: lead.originType,
            firstSeenAt: now,
            lastSeenAt: now,
            freshnessScore: lead.freshnessScore!,
            clusterId: lead.clusterId ?? null,
            duplicateProbability: lead.duplicateProbability ?? null,
            dedupeDecision: lead.dedupeDecision ?? 'distinct',
            matchReasons: lead.matchReasons ?? [],
            // AI insights populated in next step
            aiInsightClaude: null as string | null,
            aiInsightGPT: null as string | null,
            aiRecommendedAction: '',
            aiResponseDraft: '',
            aiWhyStrong: '',
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

          let savedId: string;

          if (lead.profileHandle) {
            const saved = await prisma.ir_lead.upsert({
              where: {
                profileHandle_sourcePlatform_campaignId: {
                  profileHandle: lead.profileHandle,
                  sourcePlatform: lead.sourcePlatform,
                  campaignId,
                },
              },
              update: { ...scoreFields, lastSeenAt: now },
              create: createData,
              select: { id: true },
            });
            savedId = saved.id;
          } else {
            const contentPrefix = lead.sourceContent.slice(0, 100);
            const existing = await prisma.ir_lead.findFirst({
              where: { campaignId, sourcePlatform: lead.sourcePlatform, sourceContent: { startsWith: contentPrefix } },
              select: { id: true },
            });
            if (existing) {
              await prisma.ir_lead.update({ where: { id: existing.id }, data: { ...scoreFields, lastSeenAt: now } });
              savedId = existing.id;
            } else {
              const created = await prisma.ir_lead.create({ data: createData, select: { id: true } });
              savedId = created.id;
            }
          }

          ids.push({ id: savedId, idx: i });
        }

        return ids;
      });

      // Step 5: AI insights — top 10 leads only, one step each, run in parallel
      await Promise.all(
        savedLeadIds.slice(0, 10).map(({ id: leadId, idx }) =>
          step.run(`insights-${idx}`, async () => {
            const lead = ranked[idx];
            try {
              const insights = await generateAIInsights(lead, campaignContext);
              await prisma.ir_lead.update({
                where: { id: leadId },
                data: {
                  aiInsightClaude: insights.claudeInsight,
                  aiInsightGPT: insights.gptInsight,
                  aiRecommendedAction: insights.recommendedAction,
                  aiResponseDraft: insights.responseDraft,
                  aiWhyStrong: insights.whyStrong,
                },
              });
            } catch {
              // Non-fatal — lead is already saved; insights just won't show
            }
          })
        )
      );

      // Step 6: Mark campaign complete
      await step.run('complete-campaign', async () => {
        const counts = {
          hot: ranked.filter(l => l.tier === 'hot').length,
          warm: ranked.filter(l => l.tier === 'warm').length,
          cool: ranked.filter(l => l.tier === 'cool').length,
        };
        await updateCampaignStatus(campaignId, 'completed', {
          completedAt: new Date(),
          totalLeads: ranked.length,
          hotLeads: counts.hot,
          warmLeads: counts.warm,
          coolLeads: counts.cool,
        });
        console.log(`[IntentRadar] Campaign ${campaignId} completed: ${ranked.length} leads (${counts.hot} hot, ${counts.warm} warm, ${counts.cool} cool)`);
      });

      return { campaignId, totalLeads: ranked.length };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentRadar] Campaign ${campaignId} failed:`, errorMessage);

      try {
        await prisma.ir_campaign.update({
          where: { id: campaignId },
          data: { status: 'failed', failedAt: new Date(), errorMessage, updatedAt: new Date() },
        });
      } catch (dbError) {
        console.error('[IntentRadar] Could not persist failed status:', dbError);
      }

      throw error;
    }
  }
);
