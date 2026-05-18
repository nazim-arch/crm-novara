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
  assigned_to: { select: { id: true, name: true } },
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
    if (role === "Sales" || role === "Operations") {
      assignedFilter = { assigned_to_id: session.user.id };
    } else if (agentParam && agentParam !== "team") {
      assignedFilter = { assigned_to_id: agentParam === "mine" ? session.user.id : agentParam };
    }
    // if "team" and admin/manager: no filter → all agents

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const baseWhere = { completed_at: null, ...assignedFilter };

    const [overdue, callbackDue, todayItems, callbackPending, completedToday] = await Promise.all([
      // 1. Overdue (scheduled before today, no callback, pending)
      prisma.followUp.findMany({
        where: { ...baseWhere, callback_at: null, scheduled_at: { lt: todayStart } },
        include: FU_INCLUDE,
        orderBy: { scheduled_at: "asc" },
        take: 100,
      }),
      // 2. Callbacks whose time has arrived (callback_at <= now)
      prisma.followUp.findMany({
        where: { ...baseWhere, callback_at: { not: null, lte: now } },
        include: FU_INCLUDE,
        orderBy: { callback_at: "asc" },
        take: 100,
      }),
      // 3. Due today (no callback_at set)
      prisma.followUp.findMany({
        where: { ...baseWhere, callback_at: null, scheduled_at: { gte: todayStart, lte: todayEnd } },
        include: FU_INCLUDE,
        orderBy: { scheduled_at: "asc" },
        take: 100,
      }),
      // 4. Callbacks still future (parked, not yet due)
      prisma.followUp.findMany({
        where: { ...baseWhere, callback_at: { gt: now } },
        include: FU_INCLUDE,
        orderBy: { callback_at: "asc" },
        take: 200,
      }),
      // 5. Completed today
      prisma.followUp.findMany({
        where: { ...assignedFilter, completed_at: { gte: todayStart, lte: todayEnd } },
        include: FU_INCLUDE,
        orderBy: { completed_at: "desc" },
        take: 100,
      }),
    ]);

    // Stats
    const [hotActive, allOverdueCount, dueTodayCount] = await Promise.all([
      prisma.followUp.count({
        where: { ...baseWhere, lead: { temperature: "Hot" } },
      }),
      prisma.followUp.count({ where: { ...baseWhere, callback_at: null, scheduled_at: { lt: todayStart } } }),
      prisma.followUp.count({ where: { ...baseWhere, callback_at: null, scheduled_at: { gte: todayStart, lte: todayEnd } } }),
    ]);

    const queue = [...overdue, ...callbackDue, ...todayItems];

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
        callback_today: callbackDue.length + callbackPending.length,
        completed_today: completedToday.length,
        hot_active: hotActive,
      },
    });
  } catch (err) {
    console.error("GET /api/follow-ups/focus-queue:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
