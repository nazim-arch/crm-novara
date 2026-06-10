import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";
import { generateId } from "@/lib/id-generator";
import type { Prisma, PropertyType } from "@/lib/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "25")));
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.slice(0, 100);

    const where: Prisma.OpportunityWhereInput = { deleted_at: null };
    if (status) where.status = status as Prisma.EnumOpportunityStatusFilter;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { project: { contains: q, mode: "insensitive" } },
        { developer: { contains: q, mode: "insensitive" } },
        { opp_number: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, opportunities] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.findMany({
        where,
        select: {
          id: true,
          opp_number: true,
          name: true,
          project: true,
          developer: true,
          property_type: true,
          location: true,
          status: true,
          commission_percent: true,
          total_sales_value: true,
          possible_revenue: true,
          closed_revenue: true,
          created_at: true,
          updated_at: true,
          _count: { select: { leads: true, expenses: true } },
        },
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      data: opportunities,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/mcp/opportunities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId } = auth as { valid: true; userId: string };

    const body = await request.json().catch(() => ({}));
    const { name, project, developer, property_type, location, commission_percent, total_sales_value } =
      body as Record<string, string | number>;

    if (!name || !project || !property_type || !location || !commission_percent) {
      return NextResponse.json(
        { error: "name, project, property_type, location, and commission_percent are required" },
        { status: 400 }
      );
    }

    const opp_number = await generateId("OPP");
    const opportunity = await prisma.opportunity.create({
      data: {
        opp_number,
        name: String(name),
        project: String(project),
        developer: developer ? String(developer) : null,
        property_type: String(property_type) as PropertyType,
        location: String(location),
        commission_percent: Number(commission_percent),
        total_sales_value: total_sales_value ? Number(total_sales_value) : null,
        opportunity_by: "Developer",
        created_by_id: userId,
      },
    });

    return NextResponse.json({ data: opportunity }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mcp/opportunities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
