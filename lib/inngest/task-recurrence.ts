import { addDays, addWeeks, addMonths } from "date-fns";
import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/id-generator";
import { logger } from "@/lib/logger";

export type TaskCompletedEventData = {
  taskId: string;
  recurrence: "Daily" | "Weekly" | "Monthly";
  dueDate: string; // ISO string
  completedById: string;
};

export const taskRecurrenceFunction = inngest.createFunction(
  { id: "task-recurrence", name: "Task: Create Recurring Instance", retries: 2 },
  { event: "task/completed.recurring" },
  async ({ event }) => {
    const { taskId, recurrence, dueDate, completedById } = event.data as TaskCompletedEventData;

    const parent = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        title: true,
        assigned_to_id: true,
        priority: true,
        lead_id: true,
        opportunity_id: true,
        client_id: true,
        sector: true,
        revenue_tagged: true,
        revenue_amount: true,
        recurrence: true,
        deleted_at: true,
      },
    });

    if (!parent || parent.deleted_at || parent.recurrence === "None") return;

    const base = new Date(dueDate);
    const nextDue =
      recurrence === "Daily"  ? addDays(base, 1)   :
      recurrence === "Weekly" ? addWeeks(base, 1)  :
                                addMonths(base, 1);

    const taskNumber = await generateId("TASK");

    await prisma.task.create({
      data: {
        task_number: taskNumber,
        title: parent.title,
        assigned_to_id: parent.assigned_to_id,
        priority: parent.priority,
        due_date: nextDue,
        lead_id: parent.lead_id,
        opportunity_id: parent.opportunity_id,
        client_id: parent.client_id,
        sector: parent.sector,
        revenue_tagged: parent.revenue_tagged,
        revenue_amount: parent.revenue_amount,
        recurrence: parent.recurrence,
        status: "Todo",
        created_by_id: completedById,
      },
    });

    logger.info("recurring task created", { parentId: taskId, taskNumber, recurrence, nextDue: nextDue.toISOString() });
  }
);
