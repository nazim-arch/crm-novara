import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/admin/diagnose-lead?lead_number=DS-LEAD-000811
// Shows full stage state: lead.status, every LeadOpportunity.status, and stage history.

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const lead_number = searchParams.get("lead_number");
  if (!lead_number) {
    return NextResponse.json({ error: "lead_number query param required" }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: { lead_number, deleted_at: null },
    select: {
      id: true,
      lead_number: true,
      full_name: true,
      phone: true,
      lead_source: true,
      status: true,
      activity_stage: true,
      created_at: true,
      updated_at: true,
      opportunities: {
        include: {
          opportunity: { select: { id: true, opp_number: true, name: true } },
          tagged_by:   { select: { name: true } },
        },
        orderBy: { tagged_at: "asc" },
      },
      stage_history: {
        include: { changed_by: { select: { name: true } } },
        orderBy: { changed_at: "asc" },
      },
      meta_leads: {
        select: {
          leadgen_id: true,
          form_id: true,
          received_at: true,
          opportunity_id: true,
        },
        orderBy: { received_at: "asc" },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: `Lead ${lead_number} not found` }, { status: 404 });
  }

  return NextResponse.json({
    lead_number:    lead.lead_number,
    full_name:      lead.full_name,
    phone:          lead.phone,
    lead_source:    lead.lead_source,
    lead_status:    lead.status,           // <── the main lead status
    lead_activity:  lead.activity_stage,
    created_at:     lead.created_at,
    updated_at:     lead.updated_at,

    opportunity_links: lead.opportunities.map((lo) => ({
      lo_id:          lo.id,
      opportunity:    lo.opportunity.opp_number,
      opp_name:       lo.opportunity.name,
      lo_status:      lo.status,           // <── per-opportunity stage
      lo_activity:    lo.activity_stage,
      tagged_at:      lo.tagged_at,
      tagged_by:      lo.tagged_by.name,
      source:         lo.notes ?? "manual",
    })),

    stage_history: lead.stage_history.map((h) => ({
      from:        h.from_stage,
      to:          h.to_stage,
      changed_by:  h.changed_by.name,
      changed_at:  h.changed_at,
      notes:       h.notes,
    })),

    meta_leads: lead.meta_leads.map((ml) => ({
      leadgen_id:     ml.leadgen_id,
      form_id:        ml.form_id,
      received_at:    ml.received_at,
      opportunity_id: ml.opportunity_id,
    })),
  });
}
