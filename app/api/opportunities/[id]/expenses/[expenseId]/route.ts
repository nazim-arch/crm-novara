import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = Promise<{ id: string; expenseId: string }>;

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, expenseId } = await params;

    const expense = await prisma.opportunityExpense.findUnique({
      where: { id: expenseId },
      select: { id: true, opportunity_id: true, added_by_id: true },
    });

    if (!expense || expense.opportunity_id !== id) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Only the creator or an Admin can delete
    const isAdmin = session.user.role === "Admin";
    const isCreator = expense.added_by_id === session.user.id;
    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.opportunityExpense.delete({ where: { id: expenseId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/opportunities/[id]/expenses/[expenseId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
