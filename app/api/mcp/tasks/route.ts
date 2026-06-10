import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";
import { generateId } from "@/lib/id-generator";
import type { Prisma, TaskPriority } from "@/lib/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "25")));
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assigned_to = searchParams.get("assigned_to");
    const overdue = searchParams.get("overdue") === "true";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const andConditions: Prisma.TaskWhereInput[] = [{ deleted_at: null }];
    if (status) andConditions.push({ status: status as Prisma.EnumTaskStatusFilter });
    if (priority) andConditions.push({ priority: priority as Prisma.EnumTaskPriorityFilter });
    if (assigned_to) andConditions.push({ assigned_to_id: assigned_to });
    if (overdue) {
      andConditions.push({
        due_date: { lt: new Date() },
        status: { notIn: ["Done", "Cancelled"] },
      });
    }
    if (from || to) {
      andConditions.push({
        due_date: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      });
    }

    const where: Prisma.TaskWhereInput = { AND: andConditions };

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        select: {
          id: true,
          task_number: true,
          title: true,
          priority: true,
          status: true,
          due_date: true,
          start_date: true,
          completion_date: true,
          sector: true,
          recurrence: true,
          created_at: true,
          updated_at: true,
          assigned_to: { select: { id: true, name: true } },
          lead: { select: { id: true, lead_number: true, full_name: true } },
          opportunity: { select: { id: true, opp_number: true, name: true } },
        },
        orderBy: [{ priority: "desc" }, { due_date: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      data: tasks,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/mcp/tasks:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId } = auth as { valid: true; userId: string };

    const body = await request.json().catch(() => ({}));
    const { title, priority, due_date, assigned_to_id, description, sector, lead_id, opportunity_id } =
      body as Record<string, string>;

    if (!title || !due_date) {
      return NextResponse.json({ error: "title and due_date are required" }, { status: 400 });
    }

    const task_number = await generateId("TASK");
    const task = await prisma.task.create({
      data: {
        task_number,
        title,
        priority: (priority as TaskPriority) ?? "Medium",
        due_date: new Date(due_date),
        description: description ?? null,
        sector: sector ?? null,
        assigned_to_id: assigned_to_id ?? userId,
        created_by_id: userId,
        lead_id: lead_id ?? null,
        opportunity_id: opportunity_id ?? null,
      },
    });

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mcp/tasks:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
