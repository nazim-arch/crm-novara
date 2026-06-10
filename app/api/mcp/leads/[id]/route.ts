import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";

type Params = Promise<{ id: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { id } = await params;

    const lead = await prisma.lead.findFirst({
      where: {
        deleted_at: null,
        OR: [{ id }, { lead_number: id }],
      },
      include: {
        assigned_to: { select: { id: true, name: true, email: true, role: true } },
        lead_owner: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
        opportunities: {
          include: {
            opportunity: {
              select: {
                id: true, opp_number: true, name: true, project: true,
                status: true, commission_percent: true, location: true, property_type: true,
              },
            },
          },
        },
        followups: {
          where: { completed_at: null },
          orderBy: { scheduled_at: "asc" },
          take: 5,
        },
        stage_history: {
          include: { changed_by: { select: { id: true, name: true } } },
          orderBy: { changed_at: "desc" },
          take: 10,
        },
        tasks: {
          where: { deleted_at: null },
          select: { id: true, task_number: true, title: true, status: true, priority: true, due_date: true },
          orderBy: { due_date: "asc" },
          take: 10,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Fetch activities separately (polymorphic — no direct Prisma relation on Lead)
    const activities = await prisma.activity.findMany({
      where: { entity_type: "Lead", entity_id: lead.id },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
      take: 15,
    });

    return NextResponse.json({ data: { ...lead, activities } });
  } catch (error) {
    console.error("GET /api/mcp/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId } = auth as { valid: true; userId: string };

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const lead = await prisma.lead.findFirst({
      where: { deleted_at: null, OR: [{ id }, { lead_number: id }] },
      select: { id: true, lead_number: true, full_name: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const allowedFields = [
      "temperature", "activity_stage", "email", "whatsapp", "city",
      "lead_source", "budget_min", "budget_max", "location_preference",
      "timeline_to_buy", "purpose", "property_type", "next_followup_date",
      "financing_required", "assigned_to_id",
    ];

    const data: Record<string, unknown> = { updated_at: new Date() };
    for (const field of allowedFields) {
      if (field in body) data[field] = body[field];
    }

    if (Object.keys(data).length <= 1) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const updated = await prisma.lead.update({ where: { id: lead.id }, data });

    await prisma.activity.create({
      data: {
        entity_type: "Lead",
        entity_id: lead.id,
        action: "lead_updated",
        actor_id: userId,
        metadata: { fields: Object.keys(data).filter((k) => k !== "updated_at"), source: "mcp" },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/mcp/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
