import { inngest } from './client';
import { prisma, updateCampaignStatus, logSignal, getApiKey } from '@/lib/intentradar/db';
import { runAllScrapers } from '@/lib/intentradar/scrapers';
import { scoreSignal } from '@/lib/intentradar/scoring';
import { scoreSellerSignal } from '@/lib/intentradar/seller-scoring';
import { generateAIInsights } from '@/lib/intentradar/ai-insights';
import { computeFreshnessScore, computeRankWeight } from '@/lib/intentradar/freshness';
import { deduplicateBatch } from '@/lib/intentradar/dedupe';
import { extractSnippet } from '@/lib/intentradar/snippet';
import { classifyBuyerIntentType } from '@/lib/intentradar/modes/buyer';
import { classifySellerType, extractListingPrice } from '@/lib/intentradar/modes/seller';
import { detectNRI } from '@/lib/intentradar/scoring-helpers';

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
  intentMode?: 'BUYER' | 'SELLER';
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
      campaignId, city, microMarkets, budgetMin, budgetMax,
      propertyType, bhkConfig, buyerPersonas, urgency,
      sources, keywords, intentMode = 'BUYER',
    } = data;

    const scraperConfig = {
      city, microMarkets, budgetMin, budgetMax, propertyType,
      bhkConfig: bhkConfig ?? undefined,
      buyerPersonas, urgency, keywords, intentMode,
    };

    const campaignContext = {
      city, microMarkets, budgetMin, budgetMax,
      propertyType, bhkConfig: bhkConfig ?? undefined,
      intentMode,
    };

    try {
      // Step 1: Run scrapers (mode-aware)
      const rawSignals = await step.run('run-scrapers', async () => {
        await updateCampaignStatus(campaignId, 'running', { startedAt: new Date() });

        const keyChecks = await Promise.all([
          getApiKey('youtube').then(v => ({ key: 'youtube', has: !!v })),
          getApiKey('serp').then(v => ({ key: 'serp', has: !!v })),
          getApiKey('openai').then(v => ({ key: 'openai', has: !!v })),
        ]);
        console.log('[IntentRadar] Mode:', intentMode, '| Keys:', keyChecks.map(k => `${k.key}=${k.has ? 'YES' : 'NO'}`).join(' | '));

        return runAllScrapers(scraperConfig, sources);
      });

      // Step 2: Log raw signals
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

      // Step 3: Score, dedupe, rank (mode-aware — pure computation)
      const now = new Date();
      const freshnessScore = computeFreshnessScore(now);

      const scoredLeads = rawSignals
        .map(signal => ({ ...signal, capturedAt: new Date(signal.capturedAt) }))
        .map(signal => {
          const scored = intentMode === 'SELLER'
            ? scoreSellerSignal(signal, campaignContext)
            : scoreSignal(signal, { ...campaignContext, buyerPersonas, urgency });

          // Classify intent type per mode
          const nriResult = intentMode === 'BUYER' ? detectNRI(signal.content) : { isNRI: false, country: null };
          const intentType = intentMode === 'SELLER'
            ? classifySellerType(signal.content)
            : classifyBuyerIntentType(signal.content, nriResult.isNRI);

          return {
            ...scored,
            originType: (signal.originType ?? 'real') as 'real' | 'synthetic',
            evidenceSnippet: extractSnippet(signal.content),
            intentType,
            listingPrice: intentMode === 'SELLER' ? (signal.listingPrice || extractListingPrice(signal.content) || null) : null,
          };
        })
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 25);

      // Deduplicate
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
        .map((lead, idx) => ({ ...lead, ...dedupeResults.get(String(idx)), freshnessScore }))
        .sort((a, b) =>
          computeRankWeight(b.totalScore, b.freshnessScore!, b.dedupeDecision ?? null) -
          computeRankWeight(a.totalScore, a.freshnessScore!, a.dedupeDecision ?? null)
        );

      // Step 4: Save all leads (no AI insights yet — fast DB writes)
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
            intentMode,
            intentType: lead.intentType,
            listingPrice: lead.listingPrice ?? null,
            firstSeenAt: now,
            lastSeenAt: now,
            freshnessScore: lead.freshnessScore!,
            clusterId: lead.clusterId ?? null,
            duplicateProbability: lead.duplicateProbability ?? null,
            dedupeDecision: lead.dedupeDecision ?? 'distinct',
            matchReasons: lead.matchReasons ?? [],
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

      // Step 5: AI insights — top 10 only, one step each in parallel
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
              // Non-fatal — lead already saved
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
        console.log(`[IntentRadar] ${intentMode} campaign ${campaignId} completed: ${ranked.length} leads`);
      });

      return { campaignId, totalLeads: ranked.length, intentMode };

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
