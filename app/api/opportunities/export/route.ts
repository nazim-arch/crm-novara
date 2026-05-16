import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "opportunity:export"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const EXPORT_LIMIT = 5000;
    const opps = await prisma.opportunity.findMany({
      where: {
        deleted_at: null,
        ...(status && status !== "all" && { status: status as "Active" | "Inactive" | "Sold" }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { opp_number: { contains: search, mode: "insensitive" } },
            { project: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      select: {
        opp_number: true, name: true, project: true, developer: true,
        opportunity_by: true, property_type: true, location: true,
        commission_percent: true, status: true,
        total_sales_value: true, possible_revenue: true, closed_revenue: true,
        created_at: true,
        created_by: { select: { name: true } },
        _count: { select: { leads: true } },
      },
      orderBy: { created_at: "desc" },
      take: EXPORT_LIMIT,
    });
    const truncated = opps.length === EXPORT_LIMIT;

    const rows = opps.map((o) => ({
      "Opp ID": o.opp_number,
      "Name": o.name,
      "Project": o.project,
      "Developer/Seller": o.developer ?? "",
      "Opportunity By": o.opportunity_by,
      "Property Type": o.property_type,
      "Location": o.location,
      "Commission %": Number(o.commission_percent),
      "Status": o.status,
      "Total Sales Value": o.total_sales_value ? Number(o.total_sales_value) : "",
      "Possible Revenue": o.possible_revenue ? Number(o.possible_revenue) : "",
      "Closed Revenue": o.closed_revenue ? Number(o.closed_revenue) : "",
      "Leads Tagged": o._count.leads,
      "Created By": o.created_by.name,
      "Created At": o.created_at.toISOString().split("T")[0],
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] ?? {}).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, "Opportunities");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="opportunities-${new Date().toISOString().split("T")[0]}.xlsx"`,
        ...(truncated && { "X-Export-Truncated": "true", "X-Export-Limit": String(EXPORT_LIMIT) }),
      },
    });
  } catch (error) {
    console.error("GET /api/opportunities/export:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
