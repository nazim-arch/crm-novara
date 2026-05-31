import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";
import { startOfDay, endOfDay } from "date-fns";

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await hasPermissionAsync(session.user.role, "report:view"))) {
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
    // Stage distribution from LeadOpportunity (pipeline unit for linked leads)
    linkStageDistribution,
    // Stage distribution for unlinked leads
    unlinkedStageDistribution,
    // Pipeline value: sum potential_lead_value from non-Lost opportunity links
    linkedPipelineValue,
    // Pipeline value: unlinked leads that are not Lost
    unlinkedPipelineValue,
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
    // LeadOpportunity is the pipeline unit — count per-link stages
    prisma.leadOpportunity.groupBy({
      by: ["status"],
      where: { lead: { deleted_at: null } },
      _count: { id: true },
    }),
    // Unlinked leads (no opportunity tagged) — use Lead.status
    prisma.lead.groupBy({
      by: ["status"],
      where: { deleted_at: null, opportunities: { none: {} } },
      _count: { id: true },
    }),
    prisma.leadOpportunity.aggregate({
      where: {
        status: { notIn: ["Lost", "InvalidLead"] },
        lead: { deleted_at: null },
      },
      _sum: { potential_lead_value: true },
    }),
    prisma.lead.aggregate({
      where: {
        deleted_at: null,
        status: { notIn: ["Lost", "InvalidLead"] },
        opportunities: { none: {} },
      },
      _sum: { potential_lead_value: true, deal_value: true },
    }),
    prisma.activity.findMany({
      where: { entity_type: "Lead" },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
      take: 10,
    }),
  ]);

  // Merge stage distributions from links and unlinked leads
  const stageCounts: Record<string, number> = {};
  for (const s of linkStageDistribution) {
    stageCounts[s.status] = (stageCounts[s.status] ?? 0) + s._count.id;
  }
  for (const s of unlinkedStageDistribution) {
    stageCounts[s.status] = (stageCounts[s.status] ?? 0) + s._count.id;
  }

  const linkedValue = Number(linkedPipelineValue._sum.potential_lead_value ?? 0);
  const unlinkedValue = Number(
    unlinkedPipelineValue._sum.potential_lead_value ?? unlinkedPipelineValue._sum.deal_value ?? 0
  );

  return NextResponse.json({
    data: {
      totalLeads,
      hotLeads,
      todayFollowUps,
      overdueFollowUps,
      stageDistribution: Object.entries(stageCounts).map(([stage, count]) => ({ stage, count })),
      pipelineValue: linkedValue + unlinkedValue,
      commissionEstimate: 0,
      recentActivities,
    },
  });
}
