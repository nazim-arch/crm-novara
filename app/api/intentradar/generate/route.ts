// app/api/intentradar/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCampaign } from '@/lib/intentradar/db';
import { inngest } from '@/lib/inngest/client';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

    if (!city || !microMarkets?.length || !budgetMin || !budgetMax || !propertyType) {
      return NextResponse.json(
        { error: 'Missing required fields: city, microMarkets, budgetMin, budgetMax, propertyType' },
        { status: 400 }
      );
    }

    // Create campaign immediately (status: 'queued')
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

    // Fire background job — returns in <100ms
    await inngest.send({
      name: 'intentradar/generate.requested',
      data: {
        campaignId: campaign.id,
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
      },
    });

    return NextResponse.json({ campaignId: campaign.id, status: 'queued' });
  } catch (error) {
    console.error('Generate leads error:', error);
    return NextResponse.json(
      { error: 'Failed to queue lead generation', details: String(error) },
      { status: 500 }
    );
  }
}
