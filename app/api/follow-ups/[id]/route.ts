import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  setActiveFollowUp,
  completeActiveFollowUp,
  clearActiveFollowUp,
  FollowUpForbiddenError,
} from "@/lib/follow-ups";

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

const followUpInclude = {
  lead: { select: { id: true, lead_number: true, full_name: true } },
  opportunity: { select: { id: true, opp_number: true, name: true } },
  assigned_to: { select: { id: true, name: true } },
} as const;

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

  const p = parsed.data;

  try {
    // Completing the follow-up → funnel through the service (nulls the lead mirror).
    if (p.completed_at) {
      await completeActiveFollowUp({
        follow_up_id: id,
        outcome: p.outcome ?? existing.outcome ?? "Completed",
        notes: p.notes,
        actor_id: session.user.id,
      });
      const followUp = await prisma.followUp.findUnique({ where: { id }, include: followUpInclude });
      return NextResponse.json({ data: followUp });
    }

    // Rescheduling an active, lead-linked follow-up → supersede + create new active (newest wins).
    if (p.scheduled_at && existing.status === "Active" && existing.lead_id) {
      const { created } = await setActiveFollowUp({
        lead_id: existing.lead_id,
        scheduled_at: new Date(p.scheduled_at),
        type: p.type ?? existing.type,
        priority: p.priority ?? existing.priority,
        assigned_to_id: p.assigned_to_id !== undefined ? p.assigned_to_id : existing.assigned_to_id,
        created_by_id: session.user.id,
        notes: p.notes ?? existing.notes,
        reason: "Rescheduled by agent",
      });
      const followUp = await prisma.followUp.findUnique({ where: { id: created.id }, include: followUpInclude });
      return NextResponse.json({ data: followUp });
    }

    // Otherwise: in-place edit of non-date fields (or non-active/non-lead rows).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (p.completed_at === null) { data.completed_at = null; }
    if (p.outcome !== undefined) data.outcome = p.outcome;
    if (p.notes !== undefined) data.notes = p.notes;
    if (p.type !== undefined) data.type = p.type;
    if (p.priority !== undefined) data.priority = p.priority;
    if (p.scheduled_at !== undefined) data.scheduled_at = new Date(p.scheduled_at);
    if (p.assigned_to_id !== undefined) data.assigned_to_id = p.assigned_to_id;

    const followUp = await prisma.followUp.update({ where: { id }, data, include: followUpInclude });
    return NextResponse.json({ data: followUp });
  } catch (err) {
    if (err instanceof FollowUpForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
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

  // Deleting the active row cancels it (retained as history) and nulls the lead mirror.
  if (existing.status === "Active" && existing.lead_id) {
    await clearActiveFollowUp({
      lead_id: existing.lead_id,
      reason: "Deleted by admin",
      actor_id: session.user.id,
    });
    return NextResponse.json({ success: true });
  }

  // Non-active rows (completed / superseded / cancelled) may be hard-removed by an admin.
  await prisma.followUp.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
