import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { startOfDay, endOfDay, subDays } from "date-fns";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: basic count
  try {
    results.count = await prisma.lead.count({ where: { deleted_at: null } });
  } catch (e) {
    results.count_error = String(e);
  }

  // Test 2: findMany with same select as leads page
  try {
    results.leads = await prisma.lead.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        phone: true,
        status: true,
        temperature: true,
        property_type: true,
        next_followup_date: true,
        potential_lead_value: true,
        budget_min: true,
        budget_max: true,
        location_preference: true,
        assigned_to: { select: { id: true, name: true } },
      },
      orderBy: { updated_at: "desc" },
      take: 3,
    });
  } catch (e) {
    results.leads_error = String(e);
  }

  // Test 3: users query
  try {
    const users = await prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      take: 3,
    });
    results.users_count = users.length;
  } catch (e) {
    results.users_error = String(e);
  }

  // Test 4: filter using "stale" (has InvalidLead)
  try {
    const todayStart = startOfDay(new Date());
    await prisma.lead.count({
      where: {
        deleted_at: null,
        updated_at: { lt: subDays(todayStart, 7) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] as any },
      },
    });
    results.stale_filter = "ok";
  } catch (e) {
    results.stale_filter_error = String(e);
  }

  // Test 5: overdue followup filter
  try {
    const todayEnd = endOfDay(new Date());
    await prisma.lead.count({
      where: {
        deleted_at: null,
        next_followup_date: { lte: todayEnd },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] as any },
      },
    });
    results.followup_filter = "ok";
  } catch (e) {
    results.followup_filter_error = String(e);
  }

  const hasErrors = Object.keys(results).some(k => k.endsWith("_error"));
  return NextResponse.json({ ok: !hasErrors, ...results }, {
    status: hasErrors ? 500 : 200,
  });
}
