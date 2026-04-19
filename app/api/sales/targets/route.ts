import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { upsertTargetSchema } from "@/lib/validations/commission";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "commission:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const year = searchParams.get("year");

    const where: Record<string, unknown> = {};
    if (userId) where.user_id = userId;
    if (year) where.year = parseInt(year, 10);

    const targets = await prisma.salesMonthlyTarget.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return NextResponse.json({ data: targets });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "commission:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = upsertTargetSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { user_id, year, month, target_amount } = parsed.data;

    const target = await prisma.salesMonthlyTarget.upsert({
      where: { user_id_year_month: { user_id, year, month } },
      create: { user_id, year, month, target_amount, set_by_id: session.user.id },
      update: { target_amount, set_by_id: session.user.id },
    });

    return NextResponse.json({ data: target });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
