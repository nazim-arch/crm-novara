import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Broad one-time repair: finds every LeadOpportunity where lo.status/lo.activity_stage
// are still at the schema default "New" but the lead itself has been advanced by a user.
// This covers both webhook-auto-linked and manually-tagged records that drifted.
//
// Safe to run multiple times — idempotent. Records already at a non-New stage are never touched.
//
// GET  → dry-run: shows what would change, no DB writes
// POST → applies the sync inside a single transaction, returns a rollback snapshot

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stale = await findStaleRecords();

  return NextResponse.json({
    mode:       "dry-run",
    would_fix:  stale.length,
    records: stale.map(format),
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stale = await findStaleRecords();

  if (stale.length === 0) {
    return NextResponse.json({ message: "All LeadOpportunity stages are already in sync.", fixed: 0, snapshot: [] });
  }

  // Capture rollback snapshot BEFORE writing
  const snapshot = stale.map((lo) => ({
    lo_id:             lo.id,
    lead_number:       lo.lead.lead_number,
    opportunity:       lo.opportunity.opp_number,
    source:            lo.notes ?? "manual",
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
    message:  `Synced ${stale.length} LeadOpportunity record(s) to their lead's current stage.`,
    fixed:    stale.length,
    snapshot, // Save this — it is your rollback data
  });
}

// ─── Shared query ─────────────────────────────────────────────────────────────

async function findStaleRecords() {
  return prisma.leadOpportunity.findMany({
    where: {
      // Only records still at the "never updated" default
      status:         "New",
      activity_stage: "New",
      // Where the lead has actually been advanced by a user
      lead: {
        deleted_at: null,
        OR: [
          { status:         { not: "New" } },
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
          lead_source: true,
        },
      },
      opportunity: { select: { id: true, opp_number: true, name: true } },
    },
    orderBy: [{ lead: { lead_number: "asc" } }, { tagged_at: "asc" }],
  });
}

function format(lo: Awaited<ReturnType<typeof findStaleRecords>>[number]) {
  return {
    lo_id:                    lo.id,
    lead_number:              lo.lead.lead_number,
    opportunity:              lo.opportunity.opp_number,
    lead_source:              lo.lead.lead_source,
    source:                   lo.notes ?? "manual",
    current_lo_status:        lo.status,
    current_lo_activity:      lo.activity_stage,
    will_sync_to_status:      lo.lead.status,
    will_sync_to_activity:    lo.lead.activity_stage,
    tagged_at:                lo.tagged_at,
  };
}
