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

    // Fetch all three source datasets and existing events in parallel
    const [stageHistories, followUps, activities, existing] = await Promise.all([
      prisma.leadStageHistory.findMany({
        where: { changed_at: { gte: weekStart } },
        select: {
          id: true, lead_id: true, from_stage: true, to_stage: true,
          changed_by_id: true, changed_at: true, notes: true,
        },
      }),
      prisma.followUp.findMany({
        where: { lead_id: { not: null }, created_at: { gte: weekStart } },
        select: {
          id: true, lead_id: true, type: true, priority: true,
          scheduled_at: true, notes: true, created_by_id: true, created_at: true,
        },
      }),
      prisma.activity.findMany({
        where: {
          entity_type: "Lead",
          created_at: { gte: weekStart },
          action: { in: ["temperature_changed", "activity_stage_changed"] },
        },
        select: {
          id: true, entity_id: true, action: true,
          actor_id: true, metadata: true, created_at: true,
        },
      }),
      prisma.leadReviewEvent.findMany({
        where: { created_at: { gte: weekStart } },
        select: { lead_id: true, trigger_type: true, created_at: true },
      }),
    ]);

    // Dedup key: leadId:triggerType:YYYY-MM-DDTHH (hourly granularity)
    const existingKeys = new Set(
      existing.map((e) => `${e.lead_id}:${e.trigger_type}:${e.created_at.toISOString().slice(0, 13)}`)
    );

    const toCreate: Parameters<typeof prisma.leadReviewEvent.create>[0]["data"][] = [];

    // 1. Pipeline stage changes from LeadStageHistory
    for (const h of stageHistories) {
      const key = `${h.lead_id}:StageChange:${h.changed_at.toISOString().slice(0, 13)}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toCreate.push({
        lead_id: h.lead_id,
        triggered_by_id: h.changed_by_id,
        trigger_type: "StageChange" as any,
        trigger_context: {
          source: "backfill",
          stage_history_id: h.id,
          from_stage: h.from_stage ?? null,
          to_stage: h.to_stage,
          notes: h.notes ?? null,
        } as any,
        review_status: "Pending" as any,
        created_at: h.changed_at,
      });
    }

    // 2. Follow-ups added this week (lead follow-ups only)
    for (const fu of followUps) {
      if (!fu.lead_id) continue;
      const key = `${fu.lead_id}:FollowUpAdded:${fu.created_at.toISOString().slice(0, 13)}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toCreate.push({
        lead_id: fu.lead_id,
        triggered_by_id: fu.created_by_id,
        trigger_type: "FollowUpAdded" as any,
        trigger_context: {
          source: "backfill",
          followup_id: fu.id,
          followup_type: fu.type,
          scheduled_at: fu.scheduled_at.toISOString(),
          priority: fu.priority,
          notes: fu.notes ?? null,
        } as any,
        review_status: "Pending" as any,
        created_at: fu.created_at,
      });
    }

    // 3. Temperature / activity-stage changes from Activity log
    for (const act of activities) {
      const triggerType = act.action === "temperature_changed" ? "TemperatureChanged" : "StageChange";
      const key = `${act.entity_id}:${triggerType}:${act.created_at.toISOString().slice(0, 13)}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toCreate.push({
        lead_id: act.entity_id,
        triggered_by_id: act.actor_id,
        trigger_type: triggerType as any,
        trigger_context: {
          source: "backfill",
          activity_id: act.id,
          action: act.action,
          ...(act.metadata as Record<string, unknown>),
        } as any,
        review_status: "Pending" as any,
        created_at: act.created_at,
      });
    }

    if (toCreate.length === 0) {
      return NextResponse.json({ created: 0, message: "No new events to backfill" });
    }

    // Create all events — one by one to support custom created_at
    await Promise.all(
      toCreate.map((data) => prisma.leadReviewEvent.create({ data }))
    );

    return NextResponse.json({
      created: toCreate.length,
      breakdown: {
        stage_changes: toCreate.filter((e) => e.trigger_type === "StageChange").length,
        followups_added: toCreate.filter((e) => e.trigger_type === "FollowUpAdded").length,
        temperature_changes: toCreate.filter((e) => e.trigger_type === "TemperatureChanged").length,
      },
    });
  } catch (err) {
    console.error("POST /api/admin/lead-review/backfill:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
