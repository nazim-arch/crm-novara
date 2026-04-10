import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmStatsCards } from "@/components/dashboard/CrmStatsCards";
import { StageBarChart } from "@/components/dashboard/StageBarChart";
import { formatDateTime } from "@/lib/utils";
import { startOfDay, endOfDay, subDays } from "date-fns";
import Link from "next/link";

export default async function CrmDashboardPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "report:view")) {
    redirect("/tasks");
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
    pipelineAgg,
    recentActivities,
  ] = await Promise.all([
    prisma.lead.count({ where: { deleted_at: null } }),
    prisma.lead.count({ where: { deleted_at: null, temperature: "Hot" } }),
    prisma.lead.count({
      where: { deleted_at: null, next_followup_date: { gte: todayStart, lte: todayEnd } },
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
      where: { deleted_at: null, status: { not: "Lost" } },
      _sum: { potential_lead_value: true, deal_value: true, commission_estimate: true },
    }),
    prisma.activity.findMany({
      where: { entity_type: "Lead" },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
      take: 10,
    }),
  ]);

  const stageData = stageDistribution.map((s) => ({
    stage: s.status,
    count: s._count.id,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">CRM Dashboard</h1>
        <p className="text-sm text-muted-foreground">Sales pipeline overview</p>
      </div>

      <CrmStatsCards
        totalLeads={totalLeads}
        hotLeads={hotLeads}
        todayFollowUps={todayFollowUps}
        overdueFollowUps={overdueFollowUps}
        pipelineValue={Number(pipelineAgg._sum.potential_lead_value ?? pipelineAgg._sum.deal_value ?? 0)}
        commissionEstimate={Number(pipelineAgg._sum.commission_estimate ?? 0)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {stageData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <StageBarChart data={stageData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    <div>
                      <p>
                        <span className="font-medium">{a.actor.name}</span>{" "}
                        {a.action.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <Link href="/leads" className="p-4 border rounded-lg hover:bg-muted transition-colors">
          <p className="font-medium">All Leads</p>
          <p className="text-muted-foreground text-xs mt-0.5">View pipeline</p>
        </Link>
        <Link href="/follow-ups" className="p-4 border rounded-lg hover:bg-muted transition-colors">
          <p className="font-medium">Follow-ups</p>
          <p className="text-muted-foreground text-xs mt-0.5">Today &amp; overdue</p>
        </Link>
        <Link href="/opportunities" className="p-4 border rounded-lg hover:bg-muted transition-colors">
          <p className="font-medium">Opportunities</p>
          <p className="text-muted-foreground text-xs mt-0.5">Active projects</p>
        </Link>
        <Link href="/leads/new" className="p-4 border rounded-lg hover:bg-muted transition-colors">
          <p className="font-medium">New Lead</p>
          <p className="text-muted-foreground text-xs mt-0.5">Add to pipeline</p>
        </Link>
      </div>
    </div>
  );
}
