import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { startOfDay, endOfDay, subDays } from "date-fns";

export async function GET() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "report:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const [
    totalLeads,
    hotLeads,
    todayFollowUps,
    overdueFollowUps,
    stageDistribution,
    pipelineValue,
    recentActivities,
  ] = await Promise.all([
    prisma.lead.count({ where: { deleted_at: null } }),
    prisma.lead.count({ where: { deleted_at: null, temperature: "Hot" } }),
    prisma.lead.count({
      where: {
        deleted_at: null,
        next_followup_date: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.lead.count({
      where: {
        deleted_at: null,
        next_followup_date: { lt: todayStart },
        status: { notIn: ["Won", "Lost", "OnHold"] },
      },
    }),
    prisma.lead.groupBy({
      by: ["status"],
      where: { deleted_at: null },
      _count: { id: true },
    }),
    prisma.lead.aggregate({
      where: { deleted_at: null },
      _sum: { potential_lead_value: true, deal_value: true, commission_estimate: true },
    }),
    prisma.activity.findMany({
      where: { entity_type: "Lead" },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    data: {
      totalLeads,
      hotLeads,
      todayFollowUps,
      overdueFollowUps,
      stageDistribution: stageDistribution.map((s) => ({
        stage: s.status,
        count: s._count.id,
      })),
      pipelineValue: Number(pipelineValue._sum.potential_lead_value ?? pipelineValue._sum.deal_value ?? 0),
      commissionEstimate: Number(pipelineValue._sum.commission_estimate ?? 0),
      recentActivities,
    },
  });
}
