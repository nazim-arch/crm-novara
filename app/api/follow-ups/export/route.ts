import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";
import ExcelJS from "exceljs";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "lead:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const role = session.user.role;
    const isScoped = role === "Sales" || role === "Operations" || role === "TeamLead";

    const scopeFilter = isScoped
      ? { OR: [{ assigned_to_id: session.user.id }, { created_by_id: session.user.id }] }
      : {};

    const followUps = await prisma.followUp.findMany({
      where: scopeFilter,
      include: {
        lead: { select: { lead_number: true, full_name: true } },
        opportunity: { select: { opp_number: true, name: true } },
        assigned_to: { select: { name: true } },
        created_by: { select: { name: true } },
      },
      orderBy: { scheduled_at: "desc" },
      take: 10000,
    });

    const rows = followUps.map((f) => ({
      "Type": f.type,
      "Priority": f.priority,
      "Scheduled At": f.scheduled_at.toISOString().split("T")[0],
      "Completed At": f.completed_at ? f.completed_at.toISOString().split("T")[0] : "",
      "Status": f.completed_at ? "Completed" : "Pending",
      "Lead": f.lead ? `${f.lead.lead_number} – ${f.lead.full_name}` : "",
      "Opportunity": f.opportunity ? `${f.opportunity.opp_number} – ${f.opportunity.name}` : "",
      "Assigned To": f.assigned_to?.name ?? "",
      "Created By": f.created_by.name,
      "Notes": f.notes ?? "",
      "Outcome": f.outcome ?? "",
      "Created At": f.created_at.toISOString().split("T")[0],
    }));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Follow-ups");
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      ws.columns = keys.map((key) => ({ key, width: 22 }));
      ws.addRow(keys);
      ws.addRows(rows);
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="follow-ups-${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("GET /api/follow-ups/export:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
