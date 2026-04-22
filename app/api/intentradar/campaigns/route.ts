// app/api/intentradar/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/intentradar/db';

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const campaigns = await prisma.ir_campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        city: true,
        status: true,
        intentMode: true,
        totalLeads: true,
        hotLeads: true,
        warmLeads: true,
        coolLeads: true,
        createdAt: true,
        completedAt: true,
        propertyType: true,
        budgetMin: true,
        budgetMax: true,
      },
    });

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('Campaigns GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

// DELETE — permanently remove a campaign and all its leads (cascade)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

    await prisma.ir_campaign.delete({ where: { id: campaignId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Campaign DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
