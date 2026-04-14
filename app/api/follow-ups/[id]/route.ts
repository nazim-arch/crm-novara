import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;

const patchSchema = z.object({
  completed_at: z.string().nullable().optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(FOLLOW_UP_TYPES).optional(),
  priority: z.enum(["High", "Medium", "Low"]).optional(),
  scheduled_at: z.string().optional(),
  assigned_to_id: z.string().nullable().optional(),
});

type Params = Promise<{ id: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const existing = await prisma.followUp.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (parsed.data.completed_at !== undefined) {
    data.completed_at = parsed.data.completed_at ? new Date(parsed.data.completed_at) : null;
  }
  if (parsed.data.outcome !== undefined) data.outcome = parsed.data.outcome;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.scheduled_at !== undefined) data.scheduled_at = new Date(parsed.data.scheduled_at);
  if (parsed.data.assigned_to_id !== undefined) data.assigned_to_id = parsed.data.assigned_to_id;

  const followUp = await prisma.followUp.update({
    where: { id },
    data,
    include: {
      lead: { select: { id: true, lead_number: true, full_name: true } },
      opportunity: { select: { id: true, opp_number: true, name: true } },
      assigned_to: { select: { id: true, name: true } },
    },
  });

  // When marking as complete on a lead-linked follow-up, sync lead's next_followup_date
  if (data.completed_at && followUp.lead_id) {
    const nextFu = await prisma.followUp.findFirst({
      where: { lead_id: followUp.lead_id, completed_at: null },
      orderBy: { scheduled_at: "asc" },
    });
    await prisma.lead.update({
      where: { id: followUp.lead_id },
      data: {
        next_followup_date: nextFu?.scheduled_at ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        followup_type: (nextFu?.type ?? null) as any,
      },
    });
  }

  return NextResponse.json({ data: followUp });
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (role !== "Admin" && role !== "Manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.followUp.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If it was linked to a lead, re-sync lead's next follow-up
  const leadId = existing.lead_id;

  await prisma.followUp.delete({ where: { id } });

  if (leadId && !existing.completed_at) {
    const nextFu = await prisma.followUp.findFirst({
      where: { lead_id: leadId, completed_at: null },
      orderBy: { scheduled_at: "asc" },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        next_followup_date: nextFu?.scheduled_at ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        followup_type: (nextFu?.type ?? null) as any,
      },
    });
  }

  return NextResponse.json({ success: true });
}
