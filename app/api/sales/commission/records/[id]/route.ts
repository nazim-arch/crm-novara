import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";

// PATCH /api/sales/commission/records/:id — finalize a commission record
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "commission:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const record = await prisma.salesCommissionRecord.findUnique({ where: { id } });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (record.rec_status === "Finalized")
      return NextResponse.json({ error: "Already finalized" }, { status: 409 });

    const updated = await prisma.salesCommissionRecord.update({
      where: { id },
      data: {
        rec_status: "Finalized",
        finalized_at: new Date(),
        finalized_by_id: session.user.id,
      },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
