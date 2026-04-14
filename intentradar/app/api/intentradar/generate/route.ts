// app/api/intentradar/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma, createCampaign, updateCampaignStatus, logSignal } from '@/lib/intentradar/db';
import { scoreSignal } from '@/lib/intentradar/scoring';
import { runAllScrapers } from '@/lib/intentradar/scrapers';
import { generateAIInsights } from '@/lib/intentradar/ai-insights';

export const maxDuration = 120; // Allow up to 2 minutes for scraping

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      city,
      microMarkets,
      budgetMin,
      budgetMax,
      propertyType,
      bhkConfig,
      buyerPersonas,
      urgency,
      sources,
      keywords = [],
    } = body;

    // Validate required fields
    if (!city || !microMarkets?.length || !budgetMin || !budgetMax || !propertyType) {
      return NextResponse.json(
        { error: 'Missing required fields: city, microMarkets, budgetMin, budgetMax, propertyType' },
        { status: 400 }
      );
    }

    // 1. Create campaign
    const campaign = await createCampaign({
      name: `${bhkConfig || ''} ${propertyType} in ${microMarkets.slice(0, 2).join(', ')} | ${budgetMin}-${budgetMax} Cr`.trim(),
      city,
      microMarkets,
      budgetMin: parseFloat(budgetMin),
      budgetMax: parseFloat(budgetMax),
      propertyType,
      bhkConfig: bhkConfig || null,
      buyerPersonas: buyerPersonas || [],
      urgency: urgency || 'exploring',
      sources: sources || ['youtube', 'reddit', 'google_maps'],
      keywords: keywords || [],
    });

    // Update status to running
    await updateCampaignStatus(campaign.id, 'running', { startedAt: new Date() });

    // 2. Run scrapers
    const scraperConfig = {
      city,
      microMarkets,
      budgetMin: parseFloat(budgetMin),
      budgetMax: parseFloat(budgetMax),
      propertyType,
      bhkConfig,
      buyerPersonas: buyerPersonas || [],
      urgency: urgency || 'exploring',
      keywords: keywords || [],
    };

    const activeSources = sources || ['youtube', 'reddit', 'google_maps'];
    const rawSignals = await runAllScrapers(scraperConfig, activeSources);

    // 3. Log raw signals
    for (const signal of rawSignals) {
      await logSignal({
        campaignId: campaign.id,
        platform: signal.platform,
        authorHandle: signal.authorHandle,
        authorName: signal.authorName,
        content: signal.content,
        sourceUrl: signal.sourceUrl,
        rawData: signal.rawData,
      });
    }

    // 4. Score each signal
    const scoredLeads = rawSignals.map(signal => scoreSignal(signal, scraperConfig));

    // Sort by score descending
    scoredLeads.sort((a, b) => b.totalScore - a.totalScore);

    // Take top leads (limit to avoid excessive AI costs)
    const topLeads = scoredLeads.slice(0, 50);

    // 5. Get AI insights for top leads (HOT and WARM only to manage API costs)
    const leadsWithInsights = [];
    const campaignContext = {
      city,
      microMarkets,
      budgetMin: parseFloat(budgetMin),
      budgetMax: parseFloat(budgetMax),
      propertyType,
      bhkConfig,
    };

    for (const lead of topLeads) {
      let aiInsights = {
        claudeInsight: null as string | null,
        gptInsight: null as string | null,
        recommendedAction: '',
        responseDraft: '',
        whyStrong: '',
      };

      // Only get AI insights for HOT and WARM leads
      if (lead.tier === 'hot' || lead.tier === 'warm') {
        try {
          aiInsights = await generateAIInsights(lead, campaignContext);
        } catch (e) {
          console.error('AI insight generation failed for lead:', e);
        }
      } else {
        // Basic fallback for cool/watching
        aiInsights.recommendedAction = lead.tier === 'cool'
          ? 'Add to nurture sequence. Monitor for signal escalation.'
          : 'Passive monitoring only.';
        aiInsights.whyStrong = lead.behavioralPatterns.length > 0
          ? `Patterns: ${lead.behavioralPatterns.join(', ')}`
          : 'Basic interest signal detected';
      }

      // 6. Save lead to database
      const savedLead = await prisma.ir_lead.create({
        data: {
          campaignId: campaign.id,
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

      leadsWithInsights.push({
        ...savedLead,
        aiInsightClaude: aiInsights.claudeInsight,
        aiInsightGPT: aiInsights.gptInsight,
      });
    }

    // 7. Update campaign with results
    const counts = {
      hot: topLeads.filter(l => l.tier === 'hot').length,
      warm: topLeads.filter(l => l.tier === 'warm').length,
      cool: topLeads.filter(l => l.tier === 'cool').length,
    };

    await updateCampaignStatus(campaign.id, 'completed', {
      completedAt: new Date(),
      totalLeads: topLeads.length,
      hotLeads: counts.hot,
      warmLeads: counts.warm,
      coolLeads: counts.cool,
    });

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      summary: {
        totalSignals: rawSignals.length,
        totalLeads: topLeads.length,
        hot: counts.hot,
        warm: counts.warm,
        cool: counts.cool,
        watching: topLeads.length - counts.hot - counts.warm - counts.cool,
      },
      leads: leadsWithInsights,
    });

  } catch (error) {
    console.error('Generate leads error:', error);
    return NextResponse.json(
      { error: 'Lead generation failed', details: String(error) },
      { status: 500 }
    );
  }
}
