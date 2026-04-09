import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { startOfDay, endOfDay } from "date-fns";

export async function GET() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "task:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const [
    totalTasks,
    overdueTasks,
    dueTodayTasks,
    byAssignee,
    revenueAtRisk,
    myTasks,
  ] = await Promise.all([
    prisma.task.count({ where: { deleted_at: null, status: { notIn: ["Done", "Cancelled"] } } }),
    prisma.task.count({
      where: {
        deleted_at: null,
        due_date: { lt: todayStart },
        status: { notIn: ["Done", "Cancelled"] },
      },
    }),
    prisma.task.count({
      where: {
        deleted_at: null,
        due_date: { gte: todayStart, lte: todayEnd },
        status: { notIn: ["Done", "Cancelled"] },
      },
    }),
    prisma.task.groupBy({
      by: ["assigned_to_id"],
      where: { deleted_at: null, status: { notIn: ["Done", "Cancelled"] } },
      _count: { id: true },
    }),
    prisma.task.aggregate({
      where: {
        deleted_at: null,
        revenue_tagged: true,
        revenue_amount: { not: null },
        due_date: { lt: todayStart },
        status: { notIn: ["Done", "Cancelled"] },
      },
      _sum: { revenue_amount: true },
    }),
    prisma.task.count({
      where: {
        deleted_at: null,
        assigned_to_id: session.user.id,
        status: { notIn: ["Done", "Cancelled"] },
      },
    }),
  ]);

  // Enrich assignee data
  const assigneeIds = byAssignee.map((a) => a.assigned_to_id);
  const users = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, name: true },
  });

  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

  return NextResponse.json({
    data: {
      totalTasks,
      overdueTasks,
      dueTodayTasks,
      myTasks,
      revenueAtRisk: Number(revenueAtRisk._sum.revenue_amount ?? 0),
      byAssignee: byAssignee.map((a) => ({
        name: userMap[a.assigned_to_id] ?? "Unknown",
        count: a._count.id,
      })),
    },
  });
}
