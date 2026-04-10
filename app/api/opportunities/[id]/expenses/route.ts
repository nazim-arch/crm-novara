import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createExpenseSchema } from "@/lib/validations/expense";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const expenses = await prisma.opportunityExpense.findMany({
      where: { opportunity_id: id },
      include: { added_by: { select: { id: true, name: true } } },
      orderBy: { expense_date: "desc" },
    });

    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return NextResponse.json({ data: expenses, total });
  } catch (error) {
    console.error("GET /api/opportunities/[id]/expenses:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Confirm opportunity exists
    const opp = await prisma.opportunity.findUnique({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { expense_date, category, amount, description } = parsed.data;

    const expense = await prisma.opportunityExpense.create({
      data: {
        opportunity_id: id,
        expense_date: new Date(expense_date),
        category,
        amount,
        description: description || null,
        added_by_id: session.user.id,
      },
      include: { added_by: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ data: expense }, { status: 201 });
  } catch (error) {
    console.error("POST /api/opportunities/[id]/expenses:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
