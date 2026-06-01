import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin" && session.user.role !== "Manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "Pending";
    const agentId = searchParams.get("agent");
    const temperature = searchParams.get("temperature");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const perPage = Math.min(50, Math.max(1, Number(searchParams.get("per_page") ?? 20)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      review_status: status,
      ...(agentId ? { triggered_by_id: agentId } : {}),
      ...(dateFrom || dateTo
        ? {
            created_at: {
              ...(dateFrom ? { gte: new Date(dateFrom + "T00:00:00") } : {}),
              ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
            },
          }
        : {}),
      ...(temperature || search
        ? {
            lead: {
              ...(temperature ? { temperature } : {}),
              ...(search
                ? {
                    OR: [
                      { full_name: { contains: search, mode: "insensitive" } },
                      { lead_number: { contains: search, mode: "insensitive" } },
                      { phone: { contains: search, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };

    const [total, events] = await Promise.all([
      prisma.leadReviewEvent.count({ where }),
      prisma.leadReviewEvent.findMany({
        where,
        select: {
          id: true,
          lead_id: true,
          opportunity_id: true,
          trigger_type: true,
          trigger_context: true,
          review_status: true,
          quality_score: true,
          review_notes: true,
          park_until: true,
          escalation_reason: true,
          actioned_at: true,
          created_at: true,
          lead: {
            select: {
              id: true,
              lead_number: true,
              full_name: true,
              status: true,
              activity_stage: true,
              temperature: true,
              phone: true,
              potential_lead_value: true,
              budget_min: true,
              budget_max: true,
              property_type: true,
              location_preference: true,
              purpose: true,
              lead_source: true,
              next_followup_date: true,
              followup_type: true,
              deleted_at: true,
              alternate_requirement: true,
              assigned_to: { select: { id: true, name: true } },
            },
          },
          opportunity: { select: { id: true, opp_number: true, name: true } },
          triggered_by: { select: { id: true, name: true } },
          actioned_by: { select: { id: true, name: true } },
        },
        orderBy: { created_at: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    const serialized = events.map((e) => ({
      ...e,
      lead: e.lead
        ? {
            ...e.lead,
            potential_lead_value: e.lead.potential_lead_value ? Number(e.lead.potential_lead_value) : null,
            budget_min: e.lead.budget_min ? Number(e.lead.budget_min) : null,
            budget_max: e.lead.budget_max ? Number(e.lead.budget_max) : null,
            next_followup_date: e.lead.next_followup_date?.toISOString() ?? null,
            deleted_at: e.lead.deleted_at?.toISOString() ?? null,
          }
        : null,
      park_until: e.park_until?.toISOString() ?? null,
      actioned_at: e.actioned_at?.toISOString() ?? null,
      created_at: e.created_at.toISOString(),
    }));

    return NextResponse.json({
      data: serialized,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("GET /api/admin/lead-review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
