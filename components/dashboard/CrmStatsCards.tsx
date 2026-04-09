import { Card, CardContent } from "@/components/ui/card";
import { Users, Flame, Calendar, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CrmStatsCardsProps {
  totalLeads: number;
  hotLeads: number;
  todayFollowUps: number;
  overdueFollowUps: number;
  pipelineValue: number;
  commissionEstimate: number;
}

export function CrmStatsCards({
  totalLeads,
  hotLeads,
  todayFollowUps,
  overdueFollowUps,
  pipelineValue,
  commissionEstimate,
}: CrmStatsCardsProps) {
  const stats = [
    {
      label: "Total Leads",
      value: totalLeads,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      label: "Hot Leads",
      value: hotLeads,
      icon: Flame,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950",
    },
    {
      label: "Follow-ups Today",
      value: todayFollowUps,
      icon: Calendar,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950",
    },
    {
      label: "Overdue Follow-ups",
      value: overdueFollowUps,
      icon: AlertCircle,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-950",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{formatCurrency(pipelineValue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Pipeline Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{formatCurrency(commissionEstimate)}</p>
            <p className="text-xs text-muted-foreground mt-1">Commission Estimate</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
