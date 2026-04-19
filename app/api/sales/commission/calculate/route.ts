import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import {
  calcMonthlyRevenue,
  getActiveSlabs,
  calcCommission,
  calcAchievementPct,
} from "@/lib/sales-commission";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canManage = hasPermission(session.user.role, "commission:manage");
    const canView = hasPermission(session.user.role, "commission:view");
    if (!canManage && !canView)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const rawUserId = searchParams.get("user_id");
    const rawYear = searchParams.get("year");
    const rawMonth = searchParams.get("month");

    if (!rawUserId || !rawYear || !rawMonth)
      return NextResponse.json({ error: "user_id, year, month required" }, { status: 400 });

    const userId = rawUserId;
    const year = parseInt(rawYear, 10);
    const month = parseInt(rawMonth, 10);

    // Sales users can only view their own data
    if (!canManage && session.user.id !== userId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Check if already Finalized — skip recalculation
    const existing = await prisma.salesCommissionRecord.findUnique({
      where: { user_id_year_month: { user_id: userId, year, month } },
    });
    if (existing?.rec_status === "Finalized")
      return NextResponse.json({ data: existing });

    // Recalculate
    const { closed_revenue, leads_won, leads_won_no_value } =
      await calcMonthlyRevenue(userId, year, month);

    const slabs = await getActiveSlabs(userId, year, month);
    const { commission_amount, slab_from, slab_to, slab_pct } =
      calcCommission(closed_revenue, slabs);

    const target = await prisma.salesMonthlyTarget.findUnique({
      where: { user_id_year_month: { user_id: userId, year, month } },
    });
    const target_amount = target ? Number(target.target_amount) : null;
    const achievement_pct = calcAchievementPct(closed_revenue, target_amount);

    const record = await prisma.salesCommissionRecord.upsert({
      where: { user_id_year_month: { user_id: userId, year, month } },
      create: {
        user_id: userId,
        year,
        month,
        closed_revenue,
        leads_won,
        leads_won_no_value,
        target_amount,
        achievement_pct,
        slab_from,
        slab_to,
        slab_pct,
        commission_amount,
        rec_status: "Live",
      },
      update: {
        closed_revenue,
        leads_won,
        leads_won_no_value,
        target_amount,
        achievement_pct,
        slab_from,
        slab_to,
        slab_pct,
        commission_amount,
      },
    });

    return NextResponse.json({ data: record });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
