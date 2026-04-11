import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateTaskSchema } from "@/lib/validations/task";
import { hasPermission, taskScopeFilter } from "@/lib/rbac";

type Params = Promise<{ id: string }>;

async function verifyTaskAccess(taskId: string, role: string, userId: string) {
  const scope = taskScopeFilter(role, userId);
  if (!scope) return true;
  const task = await prisma.task.findFirst({
    where: { id: taskId, deleted_at: null, ...scope },
    select: { id: true },
  });
  return !!task;
}

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "task:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!(await verifyTaskAccess(id, session.user.role, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const task = await prisma.task.findUnique({
      where: { id, deleted_at: null },
      include: {
        assigned_to: { select: { id: true, name: true, email: true } },
        created_by: { select: { id: true, name: true } },
        lead: { select: { id: true, lead_number: true, full_name: true, phone: true, status: true } },
        opportunity: { select: { id: true, opp_number: true, name: true } },
      },
    });

    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json({ data: task });
  } catch (error) {
    console.error("GET /api/tasks/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "task:update")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!(await verifyTaskAccess(id, session.user.role, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.task.findUnique({ where: { id, deleted_at: null } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const updateData = { ...parsed.data };
    if (parsed.data.status === "Done" && !existing.completion_date) {
      (updateData as Record<string, unknown>).completion_date = new Date();
    }

    const task = await prisma.task.update({ where: { id }, data: { ...updateData, updated_at: new Date() } });

    await prisma.activity.create({
      data: {
        entity_type: "Task", entity_id: id, action: "task_updated",
        actor_id: session.user.id,
        metadata: { fields: Object.keys(parsed.data), ...(parsed.data.status && { status: parsed.data.status }) },
      },
    });

    return NextResponse.json({ data: task });
  } catch (error) {
    console.error("PATCH /api/tasks/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "task:delete")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await prisma.task.update({ where: { id, deleted_at: null }, data: { deleted_at: new Date() } });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/tasks/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
