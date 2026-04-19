import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";

// DELETE /api/sales/commission/slabs/:structure_id — removes an entire slab batch
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "commission:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: structure_id } = await params;

    const { count } = await prisma.salesCommissionSlab.deleteMany({
      where: { structure_id },
    });

    if (count === 0)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ deleted: count });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
