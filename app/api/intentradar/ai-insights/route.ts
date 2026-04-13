// app/api/intentradar/ai-insights/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma, updateLeadAIInsights } from '@/lib/intentradar/db';
import { generateAIInsights } from '@/lib/intentradar/ai-insights';

// POST - regenerate AI insights for a specific lead
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { leadId, providers = ['claude', 'gpt'] } = await req.json();

    if (!leadId) {
      return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    }

    // Fetch lead with campaign
    const lead = await prisma.ir_lead.findUnique({
      where: { id: leadId },
      include: { campaign: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const campaignContext = {
      city: lead.campaign.city,
      microMarkets: lead.campaign.microMarkets,
      budgetMin: lead.campaign.budgetMin,
      budgetMax: lead.campaign.budgetMax,
      propertyType: lead.campaign.propertyType,
      bhkConfig: lead.campaign.bhkConfig || undefined,
    };

    const leadForAnalysis = {
      sourceContent: lead.sourceContent,
      sourcePlatform: lead.sourcePlatform,
      totalScore: lead.totalScore,
      tier: lead.tier,
      inferredBuyerType: lead.inferredBuyerType,
      inferredBudget: lead.inferredBudget,
      inferredLocation: lead.inferredLocation,
      inferredTimeline: lead.inferredTimeline,
      isNRI: lead.isNRI,
      nriCountry: lead.nriCountry,
      behavioralPatterns: lead.behavioralPatterns,
      scoreSpecificity: lead.scoreSpecificity,
      scoreBudgetClarity: lead.scoreBudgetClarity,
      scoreUrgency: lead.scoreUrgency,
      scoreFinancialReady: lead.scoreFinancialReady,
      scoreLocationLock: lead.scoreLocationLock,
    };

    const insights = await generateAIInsights(leadForAnalysis, campaignContext, providers);

    // Save to DB
    await updateLeadAIInsights(leadId, {
      aiInsightClaude: insights.claudeInsight || undefined,
      aiInsightGPT: insights.gptInsight || undefined,
      aiRecommendedAction: insights.recommendedAction,
      aiResponseDraft: insights.responseDraft,
      aiWhyStrong: insights.whyStrong,
    });

    return NextResponse.json({
      success: true,
      insights: {
        claude: insights.claudeInsight,
        gpt: insights.gptInsight,
        recommendedAction: insights.recommendedAction,
        responseDraft: insights.responseDraft,
        whyStrong: insights.whyStrong,
      },
    });
  } catch (error) {
    console.error('AI insights error:', error);
    return NextResponse.json({ error: 'Failed to generate AI insights' }, { status: 500 });
  }
}
