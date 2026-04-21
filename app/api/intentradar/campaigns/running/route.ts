// app/api/intentradar/campaigns/running/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/intentradar/db';

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaign = await prisma.ir_campaign.findFirst({
    where: { status: { in: ['running', 'queued'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, name: true, startedAt: true },
  });

  return NextResponse.json({ campaign });
}
