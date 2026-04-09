import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const results: Record<string, unknown> = {};

  const checks = [
    { name: "users", fn: () => prisma.user.count() },
    { name: "leads", fn: () => prisma.lead.count({ where: { deleted_at: null } }) },
    { name: "opportunities", fn: () => prisma.opportunity.count({ where: { deleted_at: null } }) },
    { name: "tasks", fn: () => prisma.task.count({ where: { deleted_at: null } }) },
    { name: "notifications", fn: () => prisma.notification.count() },
    { name: "activities", fn: () => prisma.activity.count() },
    { name: "notes", fn: () => prisma.note.count() },
    { name: "follow_ups", fn: () => prisma.followUp.count() },
    { name: "stage_history", fn: () => prisma.leadStageHistory.count() },
    { name: "lead_opportunities", fn: () => prisma.leadOpportunity.count() },
    { name: "opportunity_expenses", fn: () => prisma.opportunityExpense.count() },
    { name: "sequence_counters", fn: () => prisma.sequenceCounter.count() },
    {
      name: "opportunities_detail",
      fn: () => prisma.opportunity.findFirst({
        include: { created_by: { select: { id: true, name: true } }, leads: true, expenses: true },
      }),
    },
    {
      name: "tasks_detail",
      fn: () => prisma.task.findFirst({
        where: { deleted_at: null },
        include: { assigned_to: { select: { id: true, name: true } }, lead: true, opportunity: true },
      }),
    },
  ];

  for (const check of checks) {
    try {
      results[check.name] = { ok: true, data: await check.fn() };
    } catch (error) {
      results[check.name] = { ok: false, error: String(error) };
    }
  }

  const allOk = Object.values(results).every((r: any) => r.ok);
  return NextResponse.json({ allOk, results });
}
