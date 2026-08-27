import { addDays, addWeeks, addMonths, isAfter } from "date-fns";
import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/id-generator";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/lib/generated/prisma/client";

export type TaskCompletedEventData = {
  taskId: string;
  recurrence: "Daily" | "Weekly" | "Monthly";
  dueDate: string; // ISO string
  completedById: string;
};

type RecurrenceUnit = "Daily" | "Weekly" | "Monthly";

const STEP: Record<RecurrenceUnit, (d: Date, n: number) => Date> = {
  Daily: addDays,
  Weekly: addWeeks,
  Monthly: addMonths,
};

/**
 * Advance `base` by (interval × unit) repeatedly until the result is strictly
 * after `after`. This keeps the original cadence but guarantees we never create
 * a past-dated instance — even when the parent was completed long after its due
 * date, or the recurrence sweep picks up a badly overdue task.
 */
export function computeNextDue(
  base: Date,
  recurrence: RecurrenceUnit,
  interval: number,
  after: Date,
): Date {
  const step = STEP[recurrence];
  const n = Math.max(1, interval);
  let next = step(base, n);
  let guard = 0;
  while (!isAfter(next, after) && guard < 1000) {
    next = step(next, n);
    guard++;
  }
  return next;
}

// Reset a checklist (array of { text, done }) so a fresh instance starts unchecked.
function resetChecklist(checklist: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined {
  if (!Array.isArray(checklist)) return undefined;
  return checklist.map((item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? { ...(item as Record<string, unknown>), done: false }
      : item,
  ) as Prisma.InputJsonValue;
}

/**
 * Create the next instance of a recurring task, if one is due.
 *
 * Idempotent: `recurrence_spawned_at` is set with a conditional update so a task
 * can only ever spawn one successor, whether the trigger is completion (via the
 * Inngest event) or the daily sweep cron. Returns whether an instance was made.
 */
export async function createNextRecurringInstance(
  taskId: string,
  completedById: string,
): Promise<{ created: boolean; reason?: string; nextDue?: Date; taskNumber?: string }> {
  const parent = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      description: true,
      assigned_to_id: true,
      priority: true,
      due_date: true,
      sector: true,
      checklist: true,
      lead_id: true,
      opportunity_id: true,
      client_id: true,
      revenue_tagged: true,
      revenue_amount: true,
      recurrence: true,
      recurrence_interval: true,
      recurrence_end_date: true,
      recurrence_spawned_at: true,
      deleted_at: true,
    },
  });

  if (!parent) return { created: false, reason: "missing" };
  if (parent.deleted_at) return { created: false, reason: "deleted" };
  if (parent.recurrence === "None") return { created: false, reason: "non-recurring" };
  if (parent.recurrence_spawned_at) return { created: false, reason: "already-spawned" };

  const now = new Date();
  const base = parent.due_date;
  const after = isAfter(now, base) ? now : base; // never create a past-dated child
  const nextDue = computeNextDue(base, parent.recurrence as RecurrenceUnit, parent.recurrence_interval, after);

  // Series has an end date and the next instance would fall past it → stop.
  if (parent.recurrence_end_date && isAfter(nextDue, parent.recurrence_end_date)) {
    await prisma.task.updateMany({
      where: { id: taskId, recurrence_spawned_at: null },
      data: { recurrence_spawned_at: now },
    });
    return { created: false, reason: "series-ended" };
  }

  // Claim the spawn slot atomically — guards against completion + sweep racing.
  const claimed = await prisma.task.updateMany({
    where: { id: taskId, recurrence_spawned_at: null },
    data: { recurrence_spawned_at: now },
  });
  if (claimed.count === 0) return { created: false, reason: "race" };

  const taskNumber = await generateId("TASK");
  try {
    await prisma.task.create({
      data: {
        task_number: taskNumber,
        title: parent.title,
        description: parent.description,
        assigned_to_id: parent.assigned_to_id,
        priority: parent.priority,
        due_date: nextDue,
        sector: parent.sector,
        checklist: resetChecklist(parent.checklist),
        lead_id: parent.lead_id,
        opportunity_id: parent.opportunity_id,
        client_id: parent.client_id,
        revenue_tagged: parent.revenue_tagged,
        revenue_amount: parent.revenue_amount,
        recurrence: parent.recurrence,
        recurrence_interval: parent.recurrence_interval,
        recurrence_end_date: parent.recurrence_end_date,
        status: "Todo",
        created_by_id: completedById,
      },
    });
  } catch (err) {
    // Roll back the claim so a retry can succeed.
    await prisma.task.updateMany({ where: { id: taskId }, data: { recurrence_spawned_at: null } });
    throw err;
  }

  logger.info("recurring task created", {
    parentId: taskId,
    taskNumber,
    recurrence: parent.recurrence,
    interval: parent.recurrence_interval,
    nextDue: nextDue.toISOString(),
  });
  return { created: true, nextDue, taskNumber };
}

export const taskRecurrenceFunction = inngest.createFunction(
  { id: "task-recurrence", name: "Task: Create Recurring Instance", retries: 2, triggers: { event: "task/completed.recurring" } },
  async ({ event }) => {
    const { taskId, completedById } = event.data as TaskCompletedEventData;
    return createNextRecurringInstance(taskId, completedById);
  },
);
