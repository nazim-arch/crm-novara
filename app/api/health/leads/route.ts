import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const count = await prisma.lead.count({ where: { deleted_at: null } });
    const leads = await prisma.lead.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        potential_lead_value: true,
        deal_value: true,
      },
      take: 20,
    });
    const agg = await prisma.lead.aggregate({
      where: { deleted_at: null },
      _sum: { potential_lead_value: true, deal_value: true },
    });
    return NextResponse.json({ ok: true, count, leads, agg });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
