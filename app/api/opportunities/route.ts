import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { generateId } from "@/lib/id-generator";
import { createOpportunitySchema } from "@/lib/validations/opportunity";
import { hasPermission } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = 20;

    const where = {
      deleted_at: null as null,
      ...(status && status !== "all" && { status: status as "Active" | "Inactive" | "Sold" }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { project: { contains: search, mode: "insensitive" as const } },
          { location: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [total, opportunities] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.findMany({
        where,
        include: {
          created_by: { select: { id: true, name: true } },
          _count: { select: { leads: true } },
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
    console.error("GET /api/opportunities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.user.role, "opportunity:create")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { notes, ...rest } = parsed.data;

    // Generate ID outside transaction (Neon HTTP driver compatibility)
    const opp_number = await generateId("OPP");
    const opportunity = await prisma.opportunity.create({
      data: {
        opp_number,
        ...rest,
        notes: notes || null,
        created_by_id: session.user.id,
      },
    });

    return NextResponse.json({ data: opportunity }, { status: 201 });
  } catch (error) {
    console.error("POST /api/opportunities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
