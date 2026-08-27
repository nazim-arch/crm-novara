import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasPermissionAsync, taskScopeFilter } from "@/lib/rbac";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createNextRecurringInstance } from "@/lib/inngest/task-recurrence";
import { notifyTaskReassigned } from "@/lib/email-notifications";
import { revalidateTag } from "next/cache";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    ids: z.array(z.string()).min(1).max(500),
    value: z.enum(["Todo", "InProgress", "Done", "Cancelled"]),
  }),
  z.object({
    action: z.literal("assign"),
    ids: z.array(z.string()).min(1).max(500),
    value: z.string().min(1),
  }),
  z.object({
    action: z.literal("due_date"),
    ids: z.array(z.string()).min(1).max(500),
    value: z.coerce.date().refine((d) => !isNaN(d.getTime()), "Invalid date"),
  }),
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string()).min(1).max(500),
  }),
]);

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const needsPerm = data.action === "delete" ? "task:delete" : "task:update";
    if (!(await hasPermissionAsync(session.user.role, needsPerm))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Scope restricts which of the requested ids the user is allowed to touch.
    const scope = taskScopeFilter(session.user.role, session.user.id);
    const baseWhere: Prisma.TaskWhereInput = {
      id: { in: data.ids },
      deleted_at: null,
      ...(scope ?? {}),
    };

    // The concrete set of tasks the user may actually act on.
    const affected = await prisma.task.findMany({
      where: baseWhere,
      select: { id: true, status: true, recurrence: true, recurrence_spawned_at: true, assigned_to_id: true, title: true, task_number: true, due_date: true },
    });
    const affectedIds = affected.map((t) => t.id);
    if (affectedIds.length === 0) {
      return NextResponse.json({ data: { count: 0 } });
    }

    let count = 0;

    if (data.action === "status") {
      const status = data.value;
      const res = await prisma.task.updateMany({
        where: { id: { in: affectedIds } },
        data: { status, updated_at: new Date() },
      });
      count = res.count;

      if (status === "Done") {
        // Stamp completion date where it isn't already set.
        await prisma.task.updateMany({
          where: { id: { in: affectedIds }, completion_date: null },
          data: { completion_date: new Date() },
        });
        // Continue any recurring series that just completed.
        const recurring = affected.filter((t) => t.recurrence !== "None" && !t.recurrence_spawned_at);
        for (const t of recurring) {
          await createNextRecurringInstance(t.id, session.user.id).catch(() => {});
        }
      }
    } else if (data.action === "assign") {
      const res = await prisma.task.updateMany({
        where: { id: { in: affectedIds } },
        data: { assigned_to_id: data.value, updated_at: new Date() },
      });
      count = res.count;

      // Notify newly-assigned users (skip tasks already owned by them / the actor).
      const newlyAssigned = affected.filter(
        (t) => t.assigned_to_id !== data.value && data.value !== session.user.id,
      );
      if (newlyAssigned.length > 0) {
        await prisma.notification.createMany({
          data: newlyAssigned.map((t) => ({
            user_id: data.value,
            type: "TaskAssigned" as const,
            message: `Task assigned to you: ${t.title} (${t.task_number})`,
            entity_type: "Task" as const,
            entity_id: t.id,
          })),
          skipDuplicates: true,
        });
        for (const t of newlyAssigned) {
          notifyTaskReassigned({
            newAssigneeId: data.value,
            taskId: t.id,
            taskTitle: t.title,
            taskNumber: t.task_number,
            dueDate: t.due_date,
            reassignedByName: session.user.name ?? session.user.email ?? "Someone",
          });
        }
      }
    } else if (data.action === "due_date") {
      const res = await prisma.task.updateMany({
        where: { id: { in: affectedIds } },
        data: { due_date: data.value, updated_at: new Date() },
      });
      count = res.count;
    } else if (data.action === "delete") {
      // Bulk delete is always a soft delete (reversible) regardless of role.
      const res = await prisma.task.updateMany({
        where: { id: { in: affectedIds } },
        data: { deleted_at: new Date() },
      });
      count = res.count;
    }

    await prisma.activity.createMany({
      data: affectedIds.map((id) => ({
        entity_type: "Task" as const,
        entity_id: id,
        action: `task_bulk_${data.action}`,
        actor_id: session.user.id,
        metadata: { action: data.action, value: "value" in data ? String(data.value) : null },
      })),
    });

    revalidateTag("crm-dashboard", "max");
    return NextResponse.json({ data: { count } });
  } catch (error) {
    console.error("POST /api/tasks/bulk:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
