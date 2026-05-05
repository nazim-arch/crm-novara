import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission, taskScopeFilter } from "@/lib/rbac";
import * as XLSX from "xlsx";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "task:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");

    const scope = taskScopeFilter(session.user.role, session.user.id);
    const where: Prisma.TaskWhereInput = {
      deleted_at: null,
      ...(scope ?? {}),
      ...(status && status !== "all" && { status: status as Prisma.EnumTaskStatusFilter }),
      ...(priority && priority !== "all" && { priority: priority as Prisma.EnumTaskPriorityFilter }),
    };

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assigned_to: { select: { name: true } },
        created_by: { select: { name: true } },
        lead: { select: { lead_number: true, full_name: true } },
        opportunity: { select: { opp_number: true, name: true } },
      },
      orderBy: { due_date: "asc" },
      take: 10000,
    });

    const rows = tasks.map((t) => ({
      "Task ID": t.task_number,
      "Title": t.title,
      "Description": t.description ?? "",
      "Priority": t.priority,
      "Status": t.status,
      "Due Date": t.due_date.toISOString().split("T")[0],
      "Start Date": t.start_date ? t.start_date.toISOString().split("T")[0] : "",
      "Completed At": t.completion_date ? t.completion_date.toISOString().split("T")[0] : "",
      "Assigned To": t.assigned_to.name,
      "Created By": t.created_by.name,
      "Lead": t.lead ? `${t.lead.lead_number} – ${t.lead.full_name}` : "",
      "Opportunity": t.opportunity ? `${t.opportunity.opp_number} – ${t.opportunity.name}` : "",
      "Revenue Tagged": t.revenue_tagged ? "Yes" : "No",
      "Revenue Amount": t.revenue_amount ? Number(t.revenue_amount) : "",
      "Notes": t.notes ?? "",
      "Created At": t.created_at.toISOString().split("T")[0],
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] ?? {}).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tasks-${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("GET /api/tasks/export:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
