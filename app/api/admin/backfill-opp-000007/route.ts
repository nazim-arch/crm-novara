import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// One-time fix: link all leads created before 2026-06-05 that are not yet linked to DS-OPP-000007.
// These leads inherited the current lead.status so the opportunity card reflects their real stage.

const CUTOFF     = new Date("2026-06-05T00:00:00.000Z");
const OPP_NUMBER = "DS-OPP-000007";

// GET = dry-run — shows which leads would be linked, no DB writes
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const opp = await prisma.opportunity.findFirst({
    where: { opp_number: OPP_NUMBER, deleted_at: null },
    select: { id: true, name: true },
  });
  if (!opp) {
    return NextResponse.json({ error: `Opportunity ${OPP_NUMBER} not found or deleted` }, { status: 404 });
  }

  const leads = await prisma.lead.findMany({
    where: {
      created_at: { lt: CUTOFF },
      deleted_at: null,
      opportunities: { none: { opportunity_id: opp.id } },
    },
    select: {
      id: true,
      lead_number: true,
      status: true,
      activity_stage: true,
      created_at: true,
      lead_source: true,
    },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({
    mode:         "dry-run",
    opportunity:  `${OPP_NUMBER} — ${opp.name}`,
    would_link:   leads.length,
    leads: leads.map((l) => ({
      lead_number:    l.lead_number,
      lead_source:    l.lead_source,
      current_status: l.status,
      created_at:     l.created_at,
    })),
  });
}

// POST = live run — creates LeadOpportunity rows inheriting each lead's current stage
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [opp, adminUser] = await Promise.all([
    prisma.opportunity.findFirst({
      where: { opp_number: OPP_NUMBER, deleted_at: null },
      select: { id: true, name: true },
    }),
    prisma.user.findFirst({
      where: { role: "Admin", is_active: true },
      select: { id: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  if (!opp) {
    return NextResponse.json({ error: `Opportunity ${OPP_NUMBER} not found or deleted` }, { status: 404 });
  }
  if (!adminUser) {
    return NextResponse.json({ error: "No active admin user found" }, { status: 500 });
  }

  const leads = await prisma.lead.findMany({
    where: {
      created_at: { lt: CUTOFF },
      deleted_at: null,
      opportunities: { none: { opportunity_id: opp.id } },
    },
    select: { id: true, lead_number: true, status: true, activity_stage: true },
  });

  if (leads.length === 0) {
    return NextResponse.json({ message: "No leads to link — all pre-June-5 leads already linked.", linked: 0 });
  }

  await prisma.leadOpportunity.createMany({
    data: leads.map((l) => ({
      lead_id:        l.id,
      opportunity_id: opp.id,
      tagged_by_id:   adminUser.id,
      notes:          "Backfilled — pre-June-5 leads linked to DS-OPP-000007",
      status:         l.status,
      activity_stage: l.activity_stage ?? "New",
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    message:      `Linked ${leads.length} lead(s) to ${OPP_NUMBER} (${opp.name}).`,
    linked:       leads.length,
    lead_numbers: leads.map((l) => l.lead_number),
  });
}
