import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { commissionStatus } from "@/lib/sales-commission";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "commission:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const rawYear = searchParams.get("year");
    const rawMonth = searchParams.get("month");

    if (!rawYear || !rawMonth)
      return NextResponse.json({ error: "year and month required" }, { status: 400 });

    const year = parseInt(rawYear, 10);
    const month = parseInt(rawMonth, 10);

    const records = await prisma.salesCommissionRecord.findMany({
      where: { year, month },
      include: {
        user: { select: { id: true, name: true, short_name: true, email: true } },
      },
      orderBy: { closed_revenue: "desc" },
    });

    const data = records.map(r => ({
      ...r,
      status: commissionStatus(r.achievement_pct != null ? Number(r.achievement_pct) : null),
    }));

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
