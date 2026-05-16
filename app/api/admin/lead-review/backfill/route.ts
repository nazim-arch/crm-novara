import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { startOfWeek } from "date-fns";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday

    // Step 1: Clear all existing Pending events so we start fresh
    await prisma.leadReviewEvent.deleteMany({ where: { review_status: "Pending" } });

    // Step 2: Fetch meaningful changes this week — stage changes + temperature changes
    const [stageHistories, activities] = await Promise.all([
      // Pipeline stage changes (LeadStageHistory)
      prisma.leadStageHistory.findMany({
        where: { changed_at: { gte: weekStart } },
        select: {
          lead_id: true, from_stage: true, to_stage: true,
          changed_by_id: true, changed_at: true, notes: true,
        },
        orderBy: { changed_at: "desc" },
      }),
      // Activity log: temperature changes and activity-stage changes
      prisma.activity.findMany({
        where: {
          entity_type: "Lead",
          created_at: { gte: weekStart },
          action: { in: ["temperature_changed", "activity_stage_changed"] },
        },
        select: {
          entity_id: true, action: true,
          actor_id: true, metadata: true, created_at: true,
        },
        orderBy: { created_at: "desc" },
      }),
    ]);

    // Step 3: For each lead, keep only the single most recent meaningful event
    // Priority: temperature_changed > stage change > activity_stage_changed
    type CandidateEvent = {
      lead_id: string;
      triggered_by_id: string;
      trigger_type: string;
      trigger_context: Record<string, unknown>;
      created_at: Date;
      priority: number;
    };

    const byLead = new Map<string, CandidateEvent>();

    function upsert(c: CandidateEvent) {
      const existing = byLead.get(c.lead_id);
      // Keep if higher priority, or same priority but more recent
      if (!existing || c.priority > existing.priority || (c.priority === existing.priority && c.created_at > existing.created_at)) {
        byLead.set(c.lead_id, c);
      }
    }

    // Temperature changes (highest priority = 3)
    for (const act of activities) {
      if (act.action !== "temperature_changed") continue;
      const meta = (act.metadata ?? {}) as Record<string, unknown>;
      upsert({
        lead_id: act.entity_id,
        triggered_by_id: act.actor_id,
        trigger_type: "TemperatureChanged",
        trigger_context: { action: act.action, ...meta },
        created_at: act.created_at,
        priority: 3,
      });
    }

    // Pipeline stage changes (priority = 2)
    for (const h of stageHistories) {
      upsert({
        lead_id: h.lead_id,
        triggered_by_id: h.changed_by_id,
        trigger_type: "StageChange",
        trigger_context: {
          from_stage: h.from_stage ?? null,
          to_stage: h.to_stage,
          notes: h.notes ?? null,
        },
        created_at: h.changed_at,
        priority: 2,
      });
    }

    // Activity stage changes (priority = 1, only significant ones)
    const significantActivityStages = ["Unreachable", "NotInterested", "Junk", "SiteVisitDone"];
    for (const act of activities) {
      if (act.action !== "activity_stage_changed") continue;
      const meta = (act.metadata ?? {}) as Record<string, unknown>;
      const toStage = String(meta.to ?? meta.activity_to ?? "");
      if (!significantActivityStages.includes(toStage)) continue;
      upsert({
        lead_id: act.entity_id,
        triggered_by_id: act.actor_id,
        trigger_type: "StageChange",
        trigger_context: { activity_stage: toStage, action: act.action, ...meta },
        created_at: act.created_at,
        priority: 1,
      });
    }

    if (byLead.size === 0) {
      return NextResponse.json({ created: 0, message: "No meaningful changes found for this week" });
    }

    // Step 4: Create one event per lead
    const candidates = Array.from(byLead.values());
    await Promise.all(
      candidates.map((c) =>
        prisma.leadReviewEvent.create({
          data: {
            lead_id: c.lead_id,
            triggered_by_id: c.triggered_by_id,
            trigger_type: c.trigger_type as any,
            trigger_context: c.trigger_context as any,
            review_status: "Pending" as any,
            created_at: c.created_at,
          },
        })
      )
    );

    const breakdown = {
      stage_changes: candidates.filter((c) => c.trigger_type === "StageChange").length,
      temperature_changes: candidates.filter((c) => c.trigger_type === "TemperatureChanged").length,
    };

    return NextResponse.json({ created: candidates.length, breakdown });
  } catch (err) {
    console.error("POST /api/admin/lead-review/backfill:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
