import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const count = await prisma.lead.count({ where: { deleted_at: null } });
    const leads = await prisma.lead.findMany({
      where: { deleted_at: null },
      include: { assigned_to: { select: { id: true, name: true } } },
      take: 5,
    });
    return NextResponse.json({ ok: true, count, sample: leads });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
