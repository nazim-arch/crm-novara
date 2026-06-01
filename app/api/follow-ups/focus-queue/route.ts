import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { startOfDay, endOfDay } from "date-fns";

const LEAD_SELECT = {
  id: true, lead_number: true, full_name: true,
  phone: true, email: true, whatsapp: true,
  temperature: true, status: true, activity_stage: true,
  potential_lead_value: true,
  budget_min: true, budget_max: true,
  property_type: true, location_preference: true,
  purpose: true, lead_source: true,
  last_contact_date: true, next_followup_date: true,
  followup_type: true, outcome: true, deleted_at: true,
  alternate_requirement: true,
  assigned_to: { select: { id: true, name: true } },
  _count: { select: { followups: true } },
};

const FU_INCLUDE = {
  lead: { select: LEAD_SELECT },
  opportunity: { select: { id: true, opp_number: true, name: true } },
  assigned_to: { select: { id: true, name: true } },
  created_by: { select: { id: true, name: true } },
};

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    const { searchParams } = new URL(request.url);
    const agentParam = searchParams.get("agent"); // "mine" | "team" | userId

    // Scope resolution
    let assignedFilter: { assigned_to_id?: string } = {};
    if (role === "Sales" || role === "Operations" || role === "TeamLead") {
      assignedFilter = { assigned_to_id: session.user.id };
    } else if (agentParam && agentParam !== "team") {
      assignedFilter = { assigned_to_id: agentParam === "mine" ? session.user.id : agentParam };
    }
    // if "team" and admin/manager: no filter → all agents

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // Base filter for pending follow-ups on non-deleted leads
    // Main queue filter: pending, due today or overdue, NOT currently parked for a future callback
    const queueWhere = {
      completed_at: null,
      lead: { deleted_at: null },
      scheduled_at: { lte: todayEnd },
      // Exclude items the agent deliberately parked for a specific callback time (still future)
      OR: [
        { callback_at: null },
        { callback_at: { lte: now } }, // callback time passed → re-enter main queue
      ],
      ...assignedFilter,
    };

    const [queue, callbackPending, completedToday] = await Promise.all([
      // Main queue: overdue + today, sorted oldest first
      prisma.followUp.findMany({
        where: queueWhere,
        include: FU_INCLUDE,
        orderBy: { scheduled_at: "asc" },
        take: 200,
      }),
      // Callback tab: items the agent has parked for a specific future time today
      prisma.followUp.findMany({
        where: {
          completed_at: null,
          lead: { deleted_at: null },
          callback_at: { gt: now },
          ...assignedFilter,
        },
        include: FU_INCLUDE,
        orderBy: { callback_at: "asc" },
        take: 200,
      }),
      // Completed today
      prisma.followUp.findMany({
        where: { ...assignedFilter, completed_at: { gte: todayStart, lte: todayEnd } },
        include: FU_INCLUDE,
        orderBy: { completed_at: "desc" },
        take: 100,
      }),
    ]);

    // Stats (using same exclusions as main queue)
    const [allOverdueCount, dueTodayCount, hotActiveCount] = await Promise.all([
      prisma.followUp.count({
        where: { ...queueWhere, scheduled_at: { lt: todayStart } },
      }),
      prisma.followUp.count({
        where: { ...queueWhere, scheduled_at: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.followUp.count({
        where: { ...queueWhere, lead: { temperature: "Hot", deleted_at: null } },
      }),
    ]);

    const serialize = (fu: typeof queue[0]) => ({
      ...fu,
      scheduled_at: fu.scheduled_at.toISOString(),
      completed_at: fu.completed_at?.toISOString() ?? null,
      callback_at: fu.callback_at?.toISOString() ?? null,
      created_at: fu.created_at.toISOString(),
      updated_at: fu.updated_at.toISOString(),
      lead: fu.lead ? {
        ...fu.lead,
        potential_lead_value: fu.lead.potential_lead_value ? Number(fu.lead.potential_lead_value) : null,
        budget_min: fu.lead.budget_min ? Number(fu.lead.budget_min) : null,
        budget_max: fu.lead.budget_max ? Number(fu.lead.budget_max) : null,
        last_contact_date: fu.lead.last_contact_date?.toISOString() ?? null,
        next_followup_date: fu.lead.next_followup_date?.toISOString() ?? null,
        deleted_at: fu.lead.deleted_at?.toISOString() ?? null,
      } : null,
    });

    return NextResponse.json({
      queue: queue.map(serialize),
      callback_pending: callbackPending.map(serialize),
      completed_today: completedToday.map(serialize),
      stats: {
        overdue: allOverdueCount,
        due_today: dueTodayCount,
        callback_today: callbackPending.length,
        completed_today: completedToday.length,
        hot_active: hotActiveCount,
      },
    });
  } catch (err) {
    console.error("GET /api/follow-ups/focus-queue:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
