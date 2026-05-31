import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { generateId } from "@/lib/id-generator";
import { createLeadSchema } from "@/lib/validations/lead";
import { hasPermissionAsync, leadScopeFilter } from "@/lib/rbac";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notifyLeadAssigned, notifyLeadCreatedAdmins } from "@/lib/email-notifications";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await hasPermissionAsync(session.user.role, "lead:read"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const status = searchParams.get("status");
    const temperature = searchParams.get("temperature");
    const assigned_to = searchParams.get("assigned_to");
    const search = searchParams.get("search")?.slice(0, 100) ?? null;

    const andConditions: Prisma.LeadWhereInput[] = [{ deleted_at: null }];

    if (status) {
      // For linked leads: filter by LeadOpportunity.status; for unlinked: filter by Lead.status
      andConditions.push({
        OR: [
          { opportunities: { some: { status: status as Prisma.EnumLeadStatusFilter } } },
          { AND: [{ opportunities: { none: {} } }, { status: status as Prisma.EnumLeadStatusFilter }] },
        ],
      });
    }
    if (temperature) andConditions.push({ temperature: temperature as Prisma.EnumLeadTemperatureFilter });
    if (assigned_to) andConditions.push({ assigned_to_id: assigned_to });
    if (search) {
      andConditions.push({
        OR: [
          { full_name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { email: { contains: search, mode: "insensitive" } },
          { lead_number: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    // Role-based record scoping
    const scope = leadScopeFilter(session.user.role, session.user.id);
    if (scope) andConditions.push(scope);

    const where: Prisma.LeadWhereInput = { AND: andConditions };

    // Status filter: for linked leads, filter on LeadOpportunity.status; include unlinked leads with matching Lead.status
    // We fetch leads and expand into rows (one per opportunity link, or one row if unlinked)
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: {
          assigned_to: { select: { id: true, name: true, avatar_url: true } },
          lead_owner: { select: { id: true, name: true } },
          _count: { select: { tasks: true } },
          opportunities: {
            include: {
              opportunity: {
                select: { id: true, opp_number: true, name: true, project: true, status: true, property_type: true, location: true },
              },
            },
            orderBy: { tagged_at: "asc" },
          },
        },
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Expand each lead into one row per opportunity link; unlinked leads → one row using lead-level fields
    type OppRef = (typeof leads)[0]["opportunities"][0]["opportunity"] | null;
    const rows = leads.flatMap((lead) => {
      if (lead.opportunities.length === 0) {
        return [{
          ...lead,
          link_id: null as string | null,
          link_status: lead.status,
          link_activity_stage: lead.activity_stage,
          link_potential_value: lead.potential_lead_value,
          link_settlement_value: lead.settlement_value,
          link_commission_pct: lead.deal_commission_percent,
          opportunity: null as OppRef,
        }];
      }
      return lead.opportunities.map((lo) => ({
        ...lead,
        link_id: lo.id as string | null,
        link_status: lo.status,
        link_activity_stage: lo.activity_stage,
        link_potential_value: lo.potential_lead_value,
        link_settlement_value: lo.settlement_value,
        link_commission_pct: lo.deal_commission_percent,
        opportunity: lo.opportunity as OppRef,
      }));
    });

    return NextResponse.json({
      data: rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/leads:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await hasPermissionAsync(session.user.role, "lead:create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      email, whatsapp, campaign_source, referral_source, unit_type,
      location_preference, timeline_to_buy, reason_for_interest,
      next_followup_date, notes: _notes, financing_required, ...rest
    } = parsed.data;

    // Hard duplicate stop — phone or email must be unique among active leads
    const dupeWhere: { phone?: string; email?: string }[] = [];
    if (rest.phone) dupeWhere.push({ phone: rest.phone });
    if (email) dupeWhere.push({ email });
    if (dupeWhere.length > 0) {
      const existing = await prisma.lead.findFirst({
        where: { deleted_at: null, OR: dupeWhere },
        select: { id: true, lead_number: true, full_name: true, phone: true, email: true },
      });
      if (existing) {
        return NextResponse.json({ error: "duplicate_lead", match: existing }, { status: 409 });
      }
    }

    const lead_number = await generateId("LEAD");
    const lead = await prisma.lead.create({
      data: {
        lead_number, ...rest,
        email: email || null, whatsapp: whatsapp || null,
        campaign_source: campaign_source || null, referral_source: referral_source || null,
        unit_type: unit_type || null, location_preference: location_preference || null,
        timeline_to_buy: timeline_to_buy || null, reason_for_interest: reason_for_interest || null,
        next_followup_date: next_followup_date ?? null, financing_required: financing_required ?? null,
        created_by_id: session.user.id,
      },
    });

    await prisma.activity.create({
      data: {
        entity_type: "Lead", entity_id: lead.id, action: "lead_created",
        actor_id: session.user.id,
        metadata: { lead_number: lead.lead_number, full_name: lead.full_name },
      },
    });

    await prisma.leadStageHistory.create({
      data: { lead_id: lead.id, to_stage: "New", changed_by_id: session.user.id, notes: "Lead created" },
    });

    // Fetch assignee name for notifications
    const assignee = lead.assigned_to_id
      ? await prisma.user.findUnique({ where: { id: lead.assigned_to_id }, select: { name: true } })
      : null;

    if (lead.assigned_to_id !== session.user.id) {
      await prisma.notification.create({
        data: {
          user_id: lead.assigned_to_id, type: "LeadAssigned",
          message: `New lead assigned to you: ${lead.full_name} (${lead.lead_number})`,
          entity_type: "Lead", entity_id: lead.id,
        },
      });
      notifyLeadAssigned({
        assignedToId: lead.assigned_to_id,
        leadId: lead.id,
        leadName: lead.full_name,
        leadNumber: lead.lead_number,
        phone: lead.phone,
        source: lead.lead_source,
        createdByName: session.user.name ?? session.user.email ?? "Someone",
      });
    }

    const admins = await prisma.user.findMany({
      where: { role: "Admin", is_active: true, id: { not: session.user.id } },
      select: { id: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          user_id: admin.id, type: "LeadAssigned" as const,
          message: `New lead created: ${lead.full_name} (${lead.lead_number}) by ${session.user.name ?? session.user.email}`,
          entity_type: "Lead" as const, entity_id: lead.id,
        })),
        skipDuplicates: true,
      });
    }
    notifyLeadCreatedAdmins({
      excludeId: session.user.id,
      leadId: lead.id,
      leadName: lead.full_name,
      leadNumber: lead.lead_number,
      source: lead.lead_source,
      createdByName: session.user.name ?? session.user.email ?? "Someone",
      assignedToName: assignee?.name ?? "Unknown",
    });

    return NextResponse.json({ data: lead }, { status: 201 });
  } catch (error) {
    console.error("POST /api/leads:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
