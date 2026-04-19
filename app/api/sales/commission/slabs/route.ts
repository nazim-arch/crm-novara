import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { saveSlabsSchema } from "@/lib/validations/commission";
import { randomUUID } from "crypto";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "commission:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

    // Return all slab batches grouped by structure_id, ordered newest first
    const slabs = await prisma.salesCommissionSlab.findMany({
      where: { user_id: userId },
      orderBy: [{ effective_from: "desc" }, { sort_order: "asc" }],
    });

    // Group into batches
    const batches = new Map<string, typeof slabs>();
    for (const slab of slabs) {
      const group = batches.get(slab.structure_id) ?? [];
      group.push(slab);
      batches.set(slab.structure_id, group);
    }

    return NextResponse.json({
      data: Array.from(batches.values()).map(rows => ({
        structure_id: rows[0].structure_id,
        effective_from: rows[0].effective_from,
        slabs: rows,
      })),
    });
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
    const parsed = saveSlabsSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { user_id, effective_from, slabs } = parsed.data;
    const structure_id = randomUUID();
    const effectiveDate = new Date(effective_from);

    const created = await prisma.salesCommissionSlab.createMany({
      data: slabs.map(s => ({
        structure_id,
        user_id,
        effective_from: effectiveDate,
        from_amount: s.from_amount,
        to_amount: s.to_amount ?? null,
        commission_pct: s.commission_pct,
        sort_order: s.sort_order,
        created_by_id: session.user.id,
      })),
    });

    return NextResponse.json({ structure_id, created: created.count }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
