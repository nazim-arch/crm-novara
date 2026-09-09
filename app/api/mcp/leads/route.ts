import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";
import { leadAccessFilter, canViewHidden, isLeadVisibilityEnabled, visibleLinkWhere } from "@/lib/lead-visibility";
import { notifyDuplicateRestrictedAdmins } from "@/lib/email-notifications";
import { generateId } from "@/lib/id-generator";
import type { Prisma, LeadTemperature } from "@/lib/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId, role } = auth as { valid: true; userId: string; role: string };

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "25")));
    const status = searchParams.get("status");
    const temperature = searchParams.get("temperature");
    const assigned_to = searchParams.get("assigned_to");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q")?.slice(0, 100);

    const andConditions: Prisma.LeadWhereInput[] = [{ deleted_at: null }];
    if (status) andConditions.push({ status: status as Prisma.EnumLeadStatusFilter });
    if (temperature) andConditions.push({ temperature: temperature as Prisma.EnumLeadTemperatureFilter });
    if (assigned_to) andConditions.push({ assigned_to_id: assigned_to });
    if (from || to) {
      andConditions.push({
        created_at: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      });
    }
    if (q) {
      andConditions.push({
        OR: [
          { full_name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
          { lead_number: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    // Scope + visibility by the token's user role (flag-gated).
    const access = await leadAccessFilter(role, userId);
    if (access) andConditions.push(access);
    const restrictLinks = (await isLeadVisibilityEnabled()) && !(await canViewHidden(role));
    const oppWhere = restrictLinks ? visibleLinkWhere : { untagged_at: null };

    const where: Prisma.LeadWhereInput = { AND: andConditions };

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        select: {
          id: true,
          lead_number: true,
          full_name: true,
          phone: true,
          email: true,
          status: true,
          temperature: true,
          activity_stage: true,
          lead_source: true,
          city: true,
          potential_lead_value: true,
          settlement_value: true,
          deal_commission_percent: true,
          lost_reason: true,
          next_followup_date: true,
          created_at: true,
          updated_at: true,
          assigned_to: { select: { id: true, name: true } },
          lead_owner: { select: { id: true, name: true } },
          opportunities: {
            where: oppWhere,
            select: {
              id: true,
              status: true,
              opportunity: { select: { id: true, opp_number: true, name: true, project: true } },
            },
          },
        },
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      data: leads,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/mcp/leads:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId, role, name: actorName } = auth as { valid: true; userId: string; role: string; name: string };

    const body = await request.json().catch(() => ({}));
    const { full_name, phone, lead_source, temperature, assigned_to_id, email } = body as Record<string, string>;

    if (!full_name || !phone || !lead_source) {
      return NextResponse.json(
        { error: "full_name, phone, and lead_source are required" },
        { status: 400 }
      );
    }

    // Duplicate check — §5.3: withhold PII of a match the token role cannot see and notify Admin.
    const matches = await prisma.lead.findMany({
      where: { deleted_at: null, phone },
      select: { id: true, lead_number: true, full_name: true },
      take: 5,
    });
    if (matches.length > 0) {
      const access = await leadAccessFilter(role, userId);
      let visibleMatch: (typeof matches)[number] | null = matches[0];
      if (access) {
        const visible = await prisma.lead.findMany({
          where: { AND: [{ id: { in: matches.map((m) => m.id) } }, access] },
          select: { id: true },
        });
        const vset = new Set(visible.map((v) => v.id));
        visibleMatch = matches.find((m) => vset.has(m.id)) ?? null;
      }
      if (visibleMatch) {
        return NextResponse.json({ error: "duplicate_lead", match: visibleMatch }, { status: 409 });
      }
      await prisma.activity.create({
        data: {
          entity_type: "Lead", entity_id: matches[0].id, action: "duplicate_restricted",
          actor_id: userId,
          metadata: { attempted_phone: phone, source: "mcp", matched: matches.map((m) => m.lead_number) },
        },
      });
      notifyDuplicateRestrictedAdmins({
        actorId: userId,
        actorName: actorName ?? "An MCP user",
        attemptedContact: phone,
        matchedLeadNumbers: matches.map((m) => m.lead_number),
      });
      return NextResponse.json(
        {
          error: "duplicate_restricted",
          message: "A lead with this phone already exists but is not accessible to you. Contact an administrator.",
        },
        { status: 409 },
      );
    }

    const lead_number = await generateId("LEAD");
    const lead = await prisma.lead.create({
      data: {
        lead_number,
        full_name,
        phone,
        lead_source,
        temperature: (temperature as LeadTemperature) ?? "Warm",
        assigned_to_id: assigned_to_id ?? null,
        lead_owner_id: assigned_to_id ?? userId,
        email: email ?? null,
        created_by_id: userId,
      },
    });

    await Promise.all([
      prisma.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: lead.id,
          action: "lead_created",
          actor_id: userId,
          metadata: { lead_number: lead.lead_number, full_name: lead.full_name, source: "mcp" },
        },
      }),
      prisma.leadStageHistory.create({
        data: { lead_id: lead.id, to_stage: "New", changed_by_id: userId, notes: "Lead created via MCP" },
      }),
    ]);

    return NextResponse.json({ data: lead }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mcp/leads:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
