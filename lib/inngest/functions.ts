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

    // ─── Top-level error boundary ───────────────────────────────────────────
    // Any unhandled exception marks the campaign as failed with an error
    // message so it never stays stuck in "running". We then re-throw so
    // Inngest also records the failure on its side.
    try {

      // Step 1: Run all scrapers
      const rawSignals = await step.run('run-scrapers', async () => {
        await updateCampaignStatus(campaignId, 'running', { startedAt: new Date() });

        // Log key availability for debugging
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

      // Step 2: Log raw signals to DB (audit trail)
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

      // Step 3: Score, dedupe, and freshness-rank leads
      const campaignContext = {
        city, microMarkets, budgetMin, budgetMax,
        propertyType, bhkConfig: bhkConfig ?? undefined,
      };

      const scoredLeads = rawSignals
        .map(signal => ({ ...signal, capturedAt: new Date(signal.capturedAt) }))
        .map(signal => ({
          ...scoreSignal(signal, scraperConfig),
          originType: (signal.originType ?? 'real') as 'real' | 'synthetic',
          evidenceSnippet: extractSnippet(signal.content),
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 50);

      // Run probabilistic deduplication over the batch
      const dedupeInput = scoredLeads.map((l, idx) => ({
        id: String(idx), // temporary index-based ID for batch comparison
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

      // Compute freshness (all fresh for new batch; existing leads updated via lastSeenAt)
      const now = new Date();
      const freshnessScore = computeFreshnessScore(now); // 1.0 for brand-new signals

      // Re-sort by composite rank weight
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

      // Step 4: AI insights + persist leads
      await step.run('save-leads-with-insights', async () => {
        for (const lead of ranked) {
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
            // Non-fatal — save lead without AI insight
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
            // Production fields
            leadOriginType: lead.originType,
            firstSeenAt: now,
            lastSeenAt: now,
            freshnessScore: lead.freshnessScore!,
            clusterId: lead.clusterId ?? null,
            duplicateProbability: lead.duplicateProbability ?? null,
            dedupeDecision: lead.dedupeDecision ?? 'distinct',
            matchReasons: lead.matchReasons ?? [],
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
            await prisma.ir_lead.upsert({
              where: {
                profileHandle_sourcePlatform_campaignId: {
                  profileHandle: lead.profileHandle,
                  sourcePlatform: lead.sourcePlatform,
                  campaignId,
                },
              },
              update: { ...scoreFields, lastSeenAt: now },
              create: createData,
            });
          } else {
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
              await prisma.ir_lead.update({
                where: { id: existing.id },
                data: { ...scoreFields, lastSeenAt: now },
              });
            } else {
              await prisma.ir_lead.create({ data: createData });
            }
          }
        }
      });

      // Step 5: Mark campaign complete
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
      // ─── Failure handler ─────────────────────────────────────────────────
      // Persist failed state so the campaign never stays stuck in "running".
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentRadar] Campaign ${campaignId} failed:`, errorMessage);

      try {
        await prisma.ir_campaign.update({
          where: { id: campaignId },
          data: {
            status: 'failed',
            failedAt: new Date(),
            errorMessage,
            updatedAt: new Date(),
          },
        });
      } catch (dbError) {
        console.error('[IntentRadar] Could not persist failed status:', dbError);
      }

      throw error; // Re-throw so Inngest records the failure on its side
    }
  }
);
