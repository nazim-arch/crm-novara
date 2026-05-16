import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const agentId = searchParams.get("agent");

    const [yearStr, monthStr] = monthParam.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1); // exclusive

    const role = session.user.role;
    const isManagerOrAdmin = role === "Admin" || role === "Manager";

    // Scope: Sales sees own data; Admin/Manager sees all (or filtered by agent)
    const scopeUserId =
      isManagerOrAdmin
        ? agentId && agentId !== "all" ? agentId : null
        : session.user.id;

    const [leads, stageChanges, siteVisits, completedFollowUps] = await Promise.all([
      // New leads created this month
      prisma.lead.findMany({
        where: {
          created_at: { gte: monthStart, lt: monthEnd },
          deleted_at: null,
          ...(scopeUserId ? { assigned_to_id: scopeUserId } : {}),
        },
        select: { created_at: true },
      }),

      // Meaningful actions = stage moved to anything except New
      prisma.leadStageHistory.findMany({
        where: {
          changed_at: { gte: monthStart, lt: monthEnd },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          to_stage: { not: "New" as any },
          ...(scopeUserId ? { changed_by_id: scopeUserId } : {}),
        },
        select: { changed_at: true },
      }),

      // Site visits = stage changed TO SiteVisitCompleted
      prisma.leadStageHistory.findMany({
        where: {
          changed_at: { gte: monthStart, lt: monthEnd },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          to_stage: "SiteVisitCompleted" as any,
          ...(scopeUserId ? { changed_by_id: scopeUserId } : {}),
        },
        select: { changed_at: true },
      }),

      // Follow-ups completed this month
      prisma.followUp.findMany({
        where: {
          completed_at: { gte: monthStart, lt: monthEnd },
          ...(scopeUserId
            ? { OR: [{ assigned_to_id: scopeUserId }, { created_by_id: scopeUserId }] }
            : {}),
        },
        select: { completed_at: true },
      }),
    ]);

    // Group all dates into a per-day map
    type DayMetrics = {
      new_leads: number;
      meaningful_actions: number;
      site_visits: number;
      completed_followups: number;
    };

    const result: Record<string, DayMetrics> = {};

    const dayKey = (d: Date) => d.toISOString().split("T")[0];

    const inc = (date: Date, key: keyof DayMetrics) => {
      const k = dayKey(date);
      if (!result[k]) result[k] = { new_leads: 0, meaningful_actions: 0, site_visits: 0, completed_followups: 0 };
      result[k][key]++;
    };

    for (const l of leads) inc(l.created_at, "new_leads");
    for (const s of stageChanges) inc(s.changed_at, "meaningful_actions");
    for (const sv of siteVisits) inc(sv.changed_at, "site_visits");
    for (const fu of completedFollowUps) if (fu.completed_at) inc(fu.completed_at, "completed_followups");

    return NextResponse.json({ month: monthParam, days: result });
  } catch (err) {
    console.error("GET /api/dashboard/activity-calendar:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
