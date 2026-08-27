import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createNextRecurringInstance } from "@/lib/inngest/task-recurrence";
import { logger } from "@/lib/logger";

/**
 * Safety-net for recurring tasks. The on-completion Inngest event spawns the
 * next instance when a task is finished, but a recurring task that is never
 * completed would otherwise end the series. This sweep picks up recurring tasks
 * that have passed their due date without spawning a successor and continues the
 * series, so cadence survives incomplete/overdue tasks.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const candidates = await prisma.task.findMany({
    where: {
      deleted_at: null,
      recurrence: { not: "None" },
      recurrence_spawned_at: null,
      due_date: { lt: now },
    },
    select: { id: true, created_by_id: true, assigned_to_id: true },
    orderBy: { due_date: "asc" },
    take: 200,
  });

  let created = 0;
  let skipped = 0;
  for (const task of candidates) {
    try {
      // Attribute the generated instance to the task's creator (falls back to assignee).
      const res = await createNextRecurringInstance(task.id, task.created_by_id ?? task.assigned_to_id);
      if (res.created) created++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error("task-recurrence-sweep failed for task", { taskId: task.id, error: String(err) });
    }
  }

  return NextResponse.json({ data: { scanned: candidates.length, created, skipped } });
}
