import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET = dry-run preview — shows what would be changed, no DB writes.
// Call this first and save the response before running POST.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stale = await prisma.leadOpportunity.findMany({
    where: {
      notes: "Auto-linked via Meta Lead Ads webhook",
      OR: [
        { status: "New" },
        { activity_stage: "New" },
      ],
      lead: {
        deleted_at: null,
        OR: [
          { status: { not: "New" } },
          { activity_stage: { not: "New" } },
        ],
      },
    },
    include: {
      lead: {
        select: {
          id: true,
          lead_number: true,
          status: true,
          activity_stage: true,
          created_at: true,
        },
      },
      opportunity: { select: { id: true, opp_number: true, name: true } },
    },
    orderBy: { tagged_at: "asc" },
  });

  return NextResponse.json({
    mode: "dry-run",
    would_fix: stale.length,
    records: stale.map((lo) => ({
      lo_id:                    lo.id,
      lead_number:              lo.lead.lead_number,
      opportunity:              lo.opportunity.opp_number,
      current_lo_status:        lo.status,
      current_lo_activity:      lo.activity_stage,
      will_restore_to_status:   lo.lead.status,
      will_restore_to_activity: lo.lead.activity_stage,
      tagged_at:                lo.tagged_at,
    })),
  });
}

// POST = live run — restores lo.status and lo.activity_stage to match lead.status.
// The response contains a full snapshot — save it as your rollback data.
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stale = await prisma.leadOpportunity.findMany({
    where: {
      notes: "Auto-linked via Meta Lead Ads webhook",
      OR: [
        { status: "New" },
        { activity_stage: "New" },
      ],
      lead: {
        deleted_at: null,
        OR: [
          { status: { not: "New" } },
          { activity_stage: { not: "New" } },
        ],
      },
    },
    include: {
      lead: {
        select: {
          id: true,
          lead_number: true,
          status: true,
          activity_stage: true,
        },
      },
      opportunity: { select: { opp_number: true } },
    },
  });

  if (stale.length === 0) {
    return NextResponse.json({ message: "No stale records found — nothing to fix.", fixed: 0, snapshot: [] });
  }

  // Build rollback snapshot BEFORE writing anything
  const snapshot = stale.map((lo) => ({
    lo_id:             lo.id,
    lead_number:       lo.lead.lead_number,
    opportunity:       lo.opportunity.opp_number,
    old_status:        lo.status,
    old_activity_stage: lo.activity_stage,
    new_status:        lo.lead.status,
    new_activity_stage: lo.lead.activity_stage ?? "New",
  }));

  await prisma.$transaction(
    stale.map((lo) =>
      prisma.leadOpportunity.update({
        where: { id: lo.id },
        data: {
          status:         lo.lead.status,
          activity_stage: lo.lead.activity_stage ?? "New",
        },
      })
    )
  );

  return NextResponse.json({
    message: `Fixed ${stale.length} LeadOpportunity record(s). Save the snapshot below for rollback.`,
    fixed:    stale.length,
    snapshot,
  });
}
