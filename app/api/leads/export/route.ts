import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync, leadScopeFilter } from "@/lib/rbac";
import ExcelJS from "exceljs";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "lead:export"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const temperature = searchParams.get("temperature");
    const assigned_to = searchParams.get("assigned_to");
    const search = searchParams.get("search");

    const andConditions: Prisma.LeadWhereInput[] = [{ deleted_at: null }];
    if (status) andConditions.push({ status: status as Prisma.EnumLeadStatusFilter });
    if (temperature) andConditions.push({ temperature: temperature as Prisma.EnumLeadTemperatureFilter });
    if (assigned_to) andConditions.push({ assigned_to_id: assigned_to });
    if (search) {
      andConditions.push({
        OR: [
          { full_name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { lead_number: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const scope = leadScopeFilter(session.user.role, session.user.id);
    if (scope) andConditions.push(scope);

    const EXPORT_LIMIT = 5000;
    const leads = await prisma.lead.findMany({
      where: { AND: andConditions },
      select: {
        lead_number: true, full_name: true, phone: true, email: true, whatsapp: true,
        lead_source: true, lead_type: true, status: true, activity_stage: true,
        temperature: true, property_type: true, purpose: true,
        budget_min: true, budget_max: true, location_preference: true,
        unit_type: true, timeline_to_buy: true, potential_lead_value: true,
        next_followup_date: true, lost_reason: true, created_at: true,
        assigned_to: { select: { name: true } },
        lead_owner: { select: { name: true } },
      },
      orderBy: { created_at: "desc" },
      take: EXPORT_LIMIT,
    });
    const truncated = leads.length === EXPORT_LIMIT;

    const rows = leads.map((l) => ({
      "Lead ID": l.lead_number,
      "Full Name": l.full_name,
      "Phone": l.phone,
      "Email": l.email ?? "",
      "WhatsApp": l.whatsapp ?? "",
      "Lead Source": l.lead_source,
      "Lead Type": l.lead_type ?? "",
      "Pipeline Stage": l.status,
      "Activity Stage": l.activity_stage,
      "Temperature": l.temperature,
      "Property Type": l.property_type ?? "",
      "Purpose": l.purpose ?? "",
      "Budget Min": l.budget_min ? Number(l.budget_min) : "",
      "Budget Max": l.budget_max ? Number(l.budget_max) : "",
      "Location": l.location_preference ?? "",
      "Unit Type": l.unit_type ?? "",
      "Timeline": l.timeline_to_buy ?? "",
      "Potential Value": l.potential_lead_value ? Number(l.potential_lead_value) : "",
      "Assigned To": l.assigned_to.name,
      "Owner": l.lead_owner.name,
      "Next Follow-up": l.next_followup_date ? l.next_followup_date.toISOString().split("T")[0] : "",
      "Lost Reason": l.lost_reason ?? "",
      "Created At": l.created_at.toISOString().split("T")[0],
    }));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Leads");
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      ws.columns = keys.map((key) => ({ key, width: 18 }));
      ws.addRow(keys);
      ws.addRows(rows);
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().split("T")[0]}.xlsx"`,
        ...(truncated && { "X-Export-Truncated": "true", "X-Export-Limit": String(EXPORT_LIMIT) }),
      },
    });
  } catch (error) {
    console.error("GET /api/leads/export:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
