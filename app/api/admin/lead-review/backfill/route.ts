import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const fallbackUserId = session.user.id;

    // Step 1: Delete all Pending events — rebuilding from source of truth
    await prisma.leadReviewEvent.deleteMany({ where: { review_status: "Pending" } });

    // Step 2: All actioned leads = status != New, not deleted
    const leads = await prisma.lead.findMany({
      where: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: { not: "New" as any },
        deleted_at: null,
      },
      select: {
        id: true,
        status: true,
        activity_stage: true,
        assigned_to_id: true,
      },
    });

    if (leads.length === 0) {
      return NextResponse.json({ created: 0, message: "No actioned leads found" });
    }

    const leadIds = leads.map((l) => l.id);

    // Step 3: Most recent stage history per lead (for from→to context)
    const stageHistories = await prisma.leadStageHistory.findMany({
      where: { lead_id: { in: leadIds } },
      select: {
        lead_id: true,
        from_stage: true,
        to_stage: true,
        changed_by_id: true,
        changed_at: true,
        notes: true,
      },
      orderBy: { changed_at: "desc" },
    });

    // Group by lead — take most recent (array is already desc-sorted)
    const recentHistory = new Map<string, typeof stageHistories[0]>();
    for (const h of stageHistories) {
      if (!recentHistory.has(h.lead_id)) recentHistory.set(h.lead_id, h);
    }

    // Step 4: Create one Pending event per lead
    const results = await Promise.allSettled(
      leads.map(async (lead) => {
        const history = recentHistory.get(lead.id);
        const triggeredById =
          history?.changed_by_id ?? lead.assigned_to_id ?? fallbackUserId;

        await prisma.leadReviewEvent.create({
          data: {
            lead_id: lead.id,
            triggered_by_id: triggeredById,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            trigger_type: "StageChange" as any,
            trigger_context: {
              from_stage: history?.from_stage ?? null,
              to_stage: history?.to_stage ?? lead.status,
              activity_stage: lead.activity_stage ?? null,
              notes: history?.notes ?? null,
              current_status: lead.status,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            review_status: "Pending" as any,
            created_at: history?.changed_at ?? new Date(),
          },
        });
      })
    );

    const created = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
      created,
      failed,
      total_actioned_leads: leads.length,
    });
  } catch (err) {
    console.error("POST /api/admin/lead-review/backfill:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
