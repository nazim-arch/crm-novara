import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermissionAsync } from "@/lib/rbac";
import { NextResponse } from "next/server";

const STATUSES = ["Pending", "Reconciled", "Cancelled"] as const;
type ClosureStatus = (typeof STATUSES)[number];

// GET /api/sales/deal-closures?status=Pending — reconciliation queue (Admin only)
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "commission:reconcile")))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("status");
    const status: ClosureStatus = STATUSES.includes(raw as ClosureStatus)
      ? (raw as ClosureStatus)
      : "Pending";

    const closures = await prisma.dealClosure.findMany({
      where: { status },
      orderBy: [{ won_year: "desc" }, { won_month: "desc" }, { planned_at: "desc" }],
      select: {
        id: true,
        status: true,
        planned_settlement_value: true,
        planned_commission_percent: true,
        planned_commission_amount: true,
        actual_settlement_value: true,
        settlement_variance: true,
        settlement_variance_pct: true,
        won_year: true,
        won_month: true,
        planned_at: true,
        reconciled_at: true,
        notes: true,
        lead: { select: { id: true, full_name: true, lead_number: true } },
        planned_by: { select: { id: true, name: true } },
        reconciled_by: { select: { id: true, name: true } },
        agent_shares: {
          select: {
            id: true,
            agent_id: true,
            role: true,
            planned_commission_amount: true,
            actual_commission_amount: true,
            incentive_amount: true,
            commission_variance: true,
            agent: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ data: closures });
  } catch (error) {
    console.error("GET /api/sales/deal-closures:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
