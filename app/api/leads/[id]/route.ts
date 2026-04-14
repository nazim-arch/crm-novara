import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateLeadSchema } from "@/lib/validations/lead";
import { hasPermission, leadScopeFilter } from "@/lib/rbac";
import { notifyLeadReassigned } from "@/lib/email-notifications";

type Params = Promise<{ id: string }>;

async function verifyLeadAccess(leadId: string, role: string, userId: string) {
  const scope = leadScopeFilter(role, userId);
  if (!scope) return true; // Admin/Manager — no restriction
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deleted_at: null, ...scope },
    select: { id: true },
  });
  return !!lead;
}

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "lead:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!(await verifyLeadAccess(id, session.user.role, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      include: {
        assigned_to: { select: { id: true, name: true, email: true, avatar_url: true } },
        lead_owner: { select: { id: true, name: true, email: true } },
        created_by: { select: { id: true, name: true } },
        opportunities: { include: { opportunity: true, tagged_by: { select: { id: true, name: true } } } },
        tasks: { where: { deleted_at: null }, include: { assigned_to: { select: { id: true, name: true } } }, orderBy: { due_date: "asc" } },
        stage_history: { include: { changed_by: { select: { id: true, name: true } } }, orderBy: { changed_at: "desc" } },
        followups: { orderBy: { scheduled_at: "desc" }, include: { created_by: { select: { id: true, name: true } } } },
      },
    });

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ data: lead });
  } catch (error) {
    console.error("GET /api/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "lead:update")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!(await verifyLeadAccess(id, session.user.role, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { notes, financing_required, ...updateData } = parsed.data;
    const cleanData: Record<string, unknown> = Object.fromEntries(
      Object.entries(updateData).map(([k, v]) => [k, v === "" ? null : v])
    );
    if (notes !== undefined) cleanData.alternate_requirement = notes === "" ? null : notes;
    if (financing_required !== undefined) cleanData.financing_required = financing_required;

    // Detect reassignment before update
    const existingLead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      select: { assigned_to_id: true, full_name: true, lead_number: true },
    });

    const lead = await prisma.lead.update({
      where: { id, deleted_at: null },
      data: { ...cleanData, updated_at: new Date() },
    });

    await prisma.activity.create({
      data: {
        entity_type: "Lead", entity_id: id, action: "lead_updated",
        actor_id: session.user.id, metadata: { fields: Object.keys(cleanData) },
      },
    });

    // Email new assignee if reassigned
    const newAssigneeId = cleanData.assigned_to_id as string | undefined;
    if (newAssigneeId && existingLead && newAssigneeId !== existingLead.assigned_to_id && newAssigneeId !== session.user.id) {
      notifyLeadReassigned({
        newAssigneeId,
        leadId: id,
        leadName: existingLead.full_name,
        leadNumber: existingLead.lead_number,
        reassignedByName: session.user.name ?? session.user.email ?? "Someone",
      });
    }

    return NextResponse.json({ data: lead });
  } catch (error) {
    console.error("PATCH /api/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "lead:delete")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await prisma.lead.update({
      where: { id, deleted_at: null },
      data: { deleted_at: new Date(), deleted_by: session.user.id },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
