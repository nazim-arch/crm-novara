import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

type Params = Promise<{ id: string }>;

const tagSchema = z.object({
  opportunity_id: z.string().min(1),
  notes: z.string().optional(),
});

// GET — list opportunities tagged to this lead
export async function GET(_req: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const tagged = await prisma.leadOpportunity.findMany({
    where: { lead_id: id },
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

  const { id } = await params;

  const lead = await prisma.lead.findUnique({ where: { id, deleted_at: null } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const body = await request.json();
  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });

  const { opportunity_id, notes } = parsed.data;

  const opp = await prisma.opportunity.findUnique({ where: { id: opportunity_id, deleted_at: null } });
  if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  // Upsert — safe if already tagged
  const tagged = await prisma.leadOpportunity.upsert({
    where: { lead_id_opportunity_id: { lead_id: id, opportunity_id } },
    create: { lead_id: id, opportunity_id, tagged_by_id: session.user.id, notes },
    update: { notes },
  });

  // Log activity
  await prisma.activity.create({
    data: {
      entity_type: "Lead",
      entity_id: id,
      action: "opportunity_tagged",
      actor_id: session.user.id,
      metadata: { opportunity_id, opportunity_name: opp.name, opp_number: opp.opp_number },
    },
  });

  return NextResponse.json({ data: tagged }, { status: 201 });
}

// DELETE — untag an opportunity
export async function DELETE(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const opportunity_id = searchParams.get("opportunity_id");
  if (!opportunity_id) return NextResponse.json({ error: "opportunity_id required" }, { status: 400 });

  await prisma.leadOpportunity.deleteMany({ where: { lead_id: id, opportunity_id } });

  return NextResponse.json({ ok: true });
}
