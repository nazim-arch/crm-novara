import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getActiveFollowUp, setActiveFollowUp, isNoFollowUpStatus } from "@/lib/follow-ups";

// Safety-net backfill: ensure every active-status lead with a next_followup_date has a matching
// active FollowUp row. Routes through the single-active service so the invariant is preserved.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const leads = await prisma.lead.findMany({
    where: { next_followup_date: { not: null }, deleted_at: null },
    select: {
      id: true,
      status: true,
      next_followup_date: true,
      followup_type: true,
      assigned_to_id: true,
    },
  });

  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (isNoFollowUpStatus(lead.status)) {
      skipped++;
      continue;
    }
    const existing = await getActiveFollowUp(lead.id);
    if (existing) {
      skipped++;
      continue;
    }

    await setActiveFollowUp({
      lead_id: lead.id,
      scheduled_at: lead.next_followup_date!,
      type: lead.followup_type ?? "Call",
      assigned_to_id: lead.assigned_to_id,
      created_by_id: session.user.id,
      reason: "Backfill: recreate active follow-up from lead mirror",
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: leads.length });
}
