import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { changeStageSchema } from "@/lib/validations/lead";
import { hasPermission } from "@/lib/rbac";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.user.role, "lead:update")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = changeStageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { to_stage, notes, lost_reason, lost_notes } = parsed.data;

    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [updatedLead] = await prisma.$transaction([
      prisma.lead.update({
        where: { id },
        data: {
          status: to_stage,
          ...(lost_reason && { lost_reason }),
          ...(lost_notes && { lost_notes }),
          updated_at: new Date(),
        },
      }),
      prisma.leadStageHistory.create({
        data: {
          lead_id: id,
          from_stage: lead.status,
          to_stage,
          changed_by_id: session.user.id,
          notes: notes || null,
        },
      }),
      prisma.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: id,
          action: "stage_changed",
          actor_id: session.user.id,
          metadata: {
            from: lead.status,
            to: to_stage,
            notes: notes || null,
            lost_reason: lost_reason || null,
          },
        },
      }),
    ]);

    return NextResponse.json({ data: updatedLead });
  } catch (error) {
    console.error("POST /api/leads/[id]/stage:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
