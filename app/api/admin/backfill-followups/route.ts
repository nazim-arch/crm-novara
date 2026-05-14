import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// One-time backfill: create FollowUp records for leads that have next_followup_date
// but no pending FollowUp record linked to them.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const leads = await prisma.lead.findMany({
    where: { next_followup_date: { not: null }, deleted_at: null },
    select: {
      id: true,
      next_followup_date: true,
      followup_type: true,
      assigned_to_id: true,
    },
  });

  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    const existing = await prisma.followUp.findFirst({
      where: { lead_id: lead.id, completed_at: null },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.followUp.create({
      data: {
        lead_id: lead.id,
        assigned_to_id: lead.assigned_to_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: (lead.followup_type ?? "Call") as any,
        scheduled_at: lead.next_followup_date!,
        created_by_id: session.user.id,
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: leads.length });
}
