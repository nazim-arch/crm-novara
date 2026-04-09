import { Card, CardContent } from "@/components/ui/card";
import { CheckSquare, AlertCircle, Calendar, User, IndianRupee } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface TaskStatsCardsProps {
  totalTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  myTasks: number;
  revenueAtRisk: number;
}

export function TaskStatsCards({
  totalTasks,
  overdueTasks,
  dueTodayTasks,
  myTasks,
  revenueAtRisk,
}: TaskStatsCardsProps) {
  const stats = [
    {
      label: "Active Tasks",
      value: totalTasks,
      icon: CheckSquare,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      label: "Overdue",
      value: overdueTasks,
      icon: AlertCircle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950",
    },
    {
      label: "Due Today",
      value: dueTodayTasks,
      icon: Calendar,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-950",
    },
    {
      label: "My Tasks",
      value: myTasks,
      icon: User,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-950",
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

      {revenueAtRisk > 0 && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950">
                <IndianRupee className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(revenueAtRisk)}</p>
                <p className="text-xs text-muted-foreground">Revenue at Risk (overdue revenue tasks)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
