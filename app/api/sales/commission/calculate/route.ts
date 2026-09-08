import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermissionAsync } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { recomputeCommissionRecord, getMonthlyCommissionTotals } from "@/lib/deal-closures";
import { CommissionRecordStatus } from "@/lib/commission-utils";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canManage = await hasPermissionAsync(session.user.role, "commission:manage");
    const canView = await hasPermissionAsync(session.user.role, "commission:view");
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

    // Pending (Won-but-unreconciled) estimate for the "Pending Reconciliation" figure.
    const totals = await getMonthlyCommissionTotals(userId, year, month);
    const pending = { pending_estimate: totals.pending_estimate, pending_deals: totals.pending_deals };

    // Check if already Finalized — skip recalculation
    const existing = await prisma.salesCommissionRecord.findUnique({
      where: { user_id_year_month: { user_id: userId, year, month } },
    });
    if (existing?.rec_status === CommissionRecordStatus.FINALIZED)
      return NextResponse.json({ data: existing, ...pending });

    // Recompute from reconciled deal-closure data (single source of truth).
    const record = await recomputeCommissionRecord(userId, year, month);

    return NextResponse.json({ data: record, ...pending });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
