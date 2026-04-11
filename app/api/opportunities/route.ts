import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { generateId } from "@/lib/id-generator";
import { createOpportunitySchema } from "@/lib/validations/opportunity";
import { hasPermission, leadScopeFilter } from "@/lib/rbac";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "opportunity:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = 20;

    const where: Prisma.OpportunityWhereInput = {
      deleted_at: null,
      ...(status && status !== "all" && { status: status as Prisma.EnumOpportunityStatusFilter }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { project: { contains: search, mode: "insensitive" } },
          { location: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    // Sales: only opportunities linked to their own leads
    if (session.user.role === "Sales") {
      const leadScope = leadScopeFilter("Sales", session.user.id)!;
      where.leads = { some: { lead: leadScope } };
    }

    const [total, opportunities] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.findMany({
        where,
        include: {
          created_by: { select: { id: true, name: true } },
          _count: { select: { leads: true } },
          configurations: { orderBy: { created_at: "asc" } },
        },
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({ data: opportunities, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("GET /api/opportunities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "opportunity:create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = createOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { configurations, notes, developer, ...rest } = parsed.data;
    const total_sales_value = configurations.reduce((sum, row) => sum + row.number_of_units * row.price_per_unit, 0);
    const possible_revenue = (total_sales_value * rest.commission_percent) / 100;
    const opp_number = await generateId("OPP");

    const opportunity = await prisma.opportunity.create({
      data: {
        opp_number, ...rest,
        developer: developer || null, notes: notes || null,
        total_sales_value, possible_revenue,
        created_by_id: session.user.id,
        configurations: {
          create: configurations.map((row) => ({
            label: row.label, number_of_units: row.number_of_units,
            price_per_unit: row.price_per_unit, row_total: row.number_of_units * row.price_per_unit,
          })),
        },
      },
      include: { configurations: true },
    });

    return NextResponse.json({ data: opportunity }, { status: 201 });
  } catch (error) {
    console.error("POST /api/opportunities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
