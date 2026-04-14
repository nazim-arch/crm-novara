import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { generateId } from "@/lib/id-generator";
import { createTaskSchema } from "@/lib/validations/task";
import { hasPermission, taskScopeFilter } from "@/lib/rbac";
import type { Prisma } from "@/lib/generated/prisma/client";
import { TaskStatus } from "@/lib/generated/prisma/client";
import { notifyTaskAssigned } from "@/lib/email-notifications";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "task:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(200, Number(searchParams.get("limit") ?? "20"));
    const status = searchParams.get("status");
    const assigned_to = searchParams.get("assigned_to");
    const lead_id = searchParams.get("lead_id");
    const priority = searchParams.get("priority");
    const overdue = searchParams.get("overdue") === "true";
    const revenue = searchParams.get("revenue") === "true";

    const andConditions: Prisma.TaskWhereInput[] = [{ deleted_at: null }];

    if (status && status !== "all") {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean) as TaskStatus[];
      if (statuses.length === 1) {
        andConditions.push({ status: statuses[0] });
      } else {
        andConditions.push({ status: { in: statuses } });
      }
    }
    if (assigned_to && assigned_to !== "all") andConditions.push({ assigned_to_id: assigned_to });
    if (lead_id) andConditions.push({ lead_id });
    if (priority && priority !== "all") andConditions.push({ priority: priority as Prisma.EnumTaskPriorityFilter });
    if (overdue) andConditions.push({ due_date: { lt: new Date() }, status: { notIn: ["Done", "Cancelled"] } });
    if (revenue) andConditions.push({ revenue_tagged: true });

    // Role-based scoping — always restrict Sales and Operations to own tasks
    const scope = taskScopeFilter(session.user.role, session.user.id);
    if (scope) andConditions.push(scope);

    const where: Prisma.TaskWhereInput = { AND: andConditions };

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: {
          assigned_to: { select: { id: true, name: true, avatar_url: true } },
          created_by: { select: { id: true, name: true } },
          lead: { select: { id: true, lead_number: true, full_name: true } },
          opportunity: { select: { id: true, opp_number: true, name: true } },
        },
        orderBy: { due_date: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({ data: tasks, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("GET /api/tasks:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "task:create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { sector, notes, description, ...rest } = parsed.data;
    const task_number = await generateId("TASK");
    const task = await prisma.task.create({
      data: {
        task_number, ...rest,
        sector: sector || null, notes: notes || null, description: description || null,
        created_by_id: session.user.id,
      },
    });

    if (task.assigned_to_id !== session.user.id) {
      await prisma.notification.create({
        data: {
          user_id: task.assigned_to_id, type: "TaskAssigned",
          message: `New task assigned to you: ${task.title} (${task.task_number})`,
          entity_type: "Task", entity_id: task.id,
        },
      });
      // Fetch lead name for context if linked
      const leadName = task.lead_id
        ? (await prisma.lead.findUnique({ where: { id: task.lead_id }, select: { full_name: true } }))?.full_name
        : null;
      notifyTaskAssigned({
        assignedToId: task.assigned_to_id,
        taskId: task.id,
        taskTitle: task.title,
        taskNumber: task.task_number,
        priority: task.priority,
        dueDate: task.due_date,
        assignedByName: session.user.name ?? session.user.email ?? "Someone",
        leadName,
      });
    }

    await prisma.activity.create({
      data: {
        entity_type: "Task", entity_id: task.id, action: "task_created",
        actor_id: session.user.id,
        metadata: { task_number: task.task_number, title: task.title },
      },
    });

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
