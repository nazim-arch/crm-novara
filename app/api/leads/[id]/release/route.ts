import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";
import { LEAD_LEVEL_HIDDEN } from "@/lib/lead-visibility";

/**
 * Fix #5 Phase 8 — release a hidden/recycled lead back to an agent. This is the only legitimate
 * repurpose path out of the Recycle pool, gated on lead:release_recycled and audit-logged.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermissionAsync(session.user.role, "lead:release_recycled"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const assignedToId = body.assigned_to_id as string | undefined;
  if (!assignedToId) {
    return NextResponse.json({ error: "assigned_to_id is required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, status: true, lead_number: true, full_name: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Only lead-level hidden leads belong to the release pool. A lead hidden purely because its
  // opportunity closed is still the agent's earned credit and must not be reassigned here.
  const releasable = [...LEAD_LEVEL_HIDDEN, "Lost"] as string[];
  if (!releasable.includes(lead.status)) {
    return NextResponse.json(
      { error: `Lead ${lead.lead_number} is not in the recycle pool (status ${lead.status}).` },
      { status: 409 },
    );
  }

  const agent = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true, name: true, is_active: true },
  });
  if (!agent || !agent.is_active) {
    return NextResponse.json({ error: "Target agent not found or inactive" }, { status: 400 });
  }

  const fromStatus = lead.status;
  await prisma.$transaction([
    prisma.lead.update({
      where: { id },
      data: { status: "New", assigned_to_id: assignedToId, lead_owner_id: assignedToId },
    }),
    prisma.activity.create({
      data: {
        entity_type: "Lead",
        entity_id: id,
        action: "lead_released",
        actor_id: session.user.id,
        metadata: {
          from_status: fromStatus,
          to_assignee_id: assignedToId,
          to_assignee_name: agent.name,
          lead_number: lead.lead_number,
        },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
