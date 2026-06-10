import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "25")));
    const status = searchParams.get("status"); // pending | overdue | completed
    const assigned_to = searchParams.get("assigned_to");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const andConditions: Prisma.FollowUpWhereInput[] = [];
    if (assigned_to) andConditions.push({ assigned_to_id: assigned_to });

    const now = new Date();
    if (status === "overdue") {
      andConditions.push({ scheduled_at: { lt: now }, completed_at: null });
    } else if (status === "completed") {
      andConditions.push({ completed_at: { not: null } });
    } else if (status === "pending") {
      andConditions.push({ completed_at: null, scheduled_at: { gte: now } });
    }

    if (from || to) {
      andConditions.push({
        scheduled_at: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      });
    }

    const where: Prisma.FollowUpWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [total, followUps] = await Promise.all([
      prisma.followUp.count({ where }),
      prisma.followUp.findMany({
        where,
        select: {
          id: true,
          type: true,
          priority: true,
          scheduled_at: true,
          completed_at: true,
          notes: true,
          outcome: true,
          attempt_count: true,
          no_response_count: true,
          callback_at: true,
          created_at: true,
          assigned_to: { select: { id: true, name: true } },
          lead: { select: { id: true, lead_number: true, full_name: true, phone: true, temperature: true } },
          opportunity: { select: { id: true, opp_number: true, name: true } },
        },
        orderBy: [{ scheduled_at: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      data: followUps,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/mcp/follow-ups:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
