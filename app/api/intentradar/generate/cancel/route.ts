// app/api/intentradar/generate/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/intentradar/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { campaignId } = await req.json();
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

  const campaign = await prisma.ir_campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.status !== 'running' && campaign.status !== 'queued') {
    return NextResponse.json({ error: 'Campaign is not running' }, { status: 400 });
  }

  // Count whatever leads are already saved
  const [total, hot, warm, cool] = await Promise.all([
    prisma.ir_lead.count({ where: { campaignId } }),
    prisma.ir_lead.count({ where: { campaignId, tier: 'hot' } }),
    prisma.ir_lead.count({ where: { campaignId, tier: 'warm' } }),
    prisma.ir_lead.count({ where: { campaignId, tier: 'cool' } }),
  ]);

  await prisma.ir_campaign.update({
    where: { id: campaignId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      totalLeads: total,
      hotLeads: hot,
      warmLeads: warm,
      coolLeads: cool,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, totalLeads: total });
}
