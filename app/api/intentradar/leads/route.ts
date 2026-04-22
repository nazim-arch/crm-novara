// app/api/intentradar/leads/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/intentradar/db';

// GET leads — default filters to real leads only (synthetic require explicit opt-in)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');
    const tier = searchParams.get('tier');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    // showSynthetic must be explicitly set to 'true' — default hides synthetic leads
    const showSynthetic = searchParams.get('showSynthetic') === 'true';

    const where: Record<string, unknown> = {};
    if (campaignId) where.campaignId = campaignId;
    if (tier) where.tier = tier;
    // Enforce real-only by default — protects sales team from acting on synthetic data
    if (!showSynthetic) where.leadOriginType = 'real';

    const [leads, total] = await Promise.all([
      prisma.ir_lead.findMany({
        where,
        orderBy: [{ totalScore: 'desc' }, { freshnessScore: 'desc' }, { lastSeenAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { campaign: { select: { name: true, city: true } } },
      }),
      prisma.ir_lead.count({ where }),
    ]);

    return NextResponse.json({
      leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      filters: { showSynthetic },
    });
  } catch (error) {
    console.error('Leads GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

// DELETE — permanently remove a lead
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    await prisma.ir_lead.delete({ where: { id: leadId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lead DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}

// PATCH — update engagement status or notes
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { leadId, status, notes } = await req.json();
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

    const updated = await prisma.ir_lead.update({
      where: { id: leadId },
      data: {
        ...(status ? { engagementStatus: status } : {}),
        ...(notes !== undefined ? { notes } : {}),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    console.error('Lead PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
