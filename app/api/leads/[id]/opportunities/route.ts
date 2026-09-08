import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasPermissionAsync } from "@/lib/rbac";
import { leadAccessFilter, canViewHidden } from "@/lib/lead-visibility";

type Params = Promise<{ id: string }>;

const tagSchema = z.object({
  opportunity_id: z.string().min(1),
  notes: z.string().optional(),
});

// Statuses a restricted role may NOT untag — Admin (lead:untag_opportunity) only.
const PROTECTED_UNTAG_STATUSES = ["Booked", "Won", "Lost", "InvalidLead"] as const;

/** Fetch the lead only if the caller may access it (ownership + visibility). */
async function accessibleLead(id: string, role: string, userId: string) {
  const access = await leadAccessFilter(role, userId);
  return prisma.lead.findFirst({
    where: { AND: [{ id, deleted_at: null }, ...(access ? [access] : [])] },
    select: { id: true, status: true, activity_stage: true, potential_lead_value: true },
  });
}

// GET — list active (non-untagged) opportunities tagged to this lead
export async function GET(_req: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tagged = await prisma.leadOpportunity.findMany({
    where: { lead_id: id, untagged_at: null },
    include: {
      opportunity: {
        select: { id: true, opp_number: true, name: true, project: true, status: true, property_type: true, location: true },
      },
    },
    orderBy: { tagged_at: "desc" },
  });

  return NextResponse.json({ data: tagged });
}

// POST — tag an opportunity to this lead
export async function POST(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user;
  if (!(await hasPermissionAsync(role, "lead:update"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const lead = await accessibleLead(id, role, userId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const body = await request.json();
  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });

  const { opportunity_id, notes } = parsed.data;

  const opp = await prisma.opportunity.findUnique({ where: { id: opportunity_id, deleted_at: null } });
  if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  // Restricted roles may only tag into a live (Active) opportunity.
  if (!(await canViewHidden(role)) && opp.status !== "Active") {
    return NextResponse.json(
      { error: "You can only tag a lead to an active project.", code: "TAG_INACTIVE_OPPORTUNITY_FORBIDDEN" },
      { status: 403 },
    );
  }

  // Reactivate-on-retag: a soft-untagged link for this pair is revived rather than recreated
  // (avoids colliding with the (lead_id, opportunity_id) unique).
  const existing = await prisma.leadOpportunity.findUnique({
    where: { lead_id_opportunity_id: { lead_id: id, opportunity_id } },
  });
  if (existing && existing.untagged_at === null) {
    return NextResponse.json({ error: "This opportunity is already linked to the lead" }, { status: 409 });
  }

  const tagged = existing
    ? await prisma.leadOpportunity.update({
        where: { id: existing.id },
        data: {
          untagged_at: null,
          untagged_by_id: null,
          status: lead.status,
          activity_stage: lead.activity_stage,
          notes: notes ?? existing.notes,
        },
      })
    : await prisma.leadOpportunity.create({
        data: {
          lead_id: id,
          opportunity_id,
          tagged_by_id: userId,
          notes,
          status: lead.status,
          activity_stage: lead.activity_stage,
          potential_lead_value: lead.potential_lead_value ?? null,
        },
      });

  await prisma.activity.create({
    data: {
      entity_type: "Lead",
      entity_id: id,
      action: "opportunity_tagged",
      actor_id: userId,
      metadata: { opportunity_id, opportunity_name: opp.name, opp_number: opp.opp_number, reactivated: !!existing },
    },
  });

  return NextResponse.json({ data: tagged }, { status: 201 });
}

// DELETE — soft-untag an opportunity (never hard-delete)
export async function DELETE(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user;
  if (!(await hasPermissionAsync(role, "lead:update"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const opportunity_id = searchParams.get("opportunity_id");
  if (!opportunity_id) return NextResponse.json({ error: "opportunity_id required" }, { status: 400 });

  const lead = await accessibleLead(id, role, userId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const link = await prisma.leadOpportunity.findUnique({
    where: { lead_id_opportunity_id: { lead_id: id, opportunity_id } },
  });
  if (!link || link.untagged_at !== null) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  // Restricted roles cannot untag an earned/dead link — lead:untag_opportunity (Admin) only.
  const canUntagProtected = await hasPermissionAsync(role, "lead:untag_opportunity");
  if (!canUntagProtected && (PROTECTED_UNTAG_STATUSES as readonly string[]).includes(link.status)) {
    return NextResponse.json(
      { error: "This link is Booked/Won/Lost and can only be removed by an Admin.", code: "UNTAG_PROTECTED_FORBIDDEN" },
      { status: 403 },
    );
  }

  await prisma.leadOpportunity.update({
    where: { id: link.id },
    data: { untagged_at: new Date(), untagged_by_id: userId },
  });

  await prisma.activity.create({
    data: {
      entity_type: "Lead",
      entity_id: id,
      action: "opportunity_untagged",
      actor_id: userId,
      metadata: { opportunity_id, status_at_removal: link.status },
    },
  });

  return NextResponse.json({ ok: true });
}
