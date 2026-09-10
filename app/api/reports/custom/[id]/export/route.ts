import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { reportDefinitionSchema } from "@/lib/reports/definition";
import { compileReport, ReportCompileError } from "@/lib/reports/compile";
import { executeCompiled } from "@/lib/reports/run";
import { getRegistry } from "@/lib/reports/registry";

type Params = Promise<{ id: string }>;

function getByPath(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), row);
}

export async function GET(_req: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const report = await prisma.savedReport.findFirst({ where: { id, owner_id: session.user.id } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const defParsed = reportDefinitionSchema.safeParse(report.definition);
  if (!defParsed.success) return NextResponse.json({ error: "Saved report definition is invalid" }, { status: 400 });
  const def = defParsed.data;
  const reg = getRegistry(def.entity);

  try {
    const compiled = compileReport(def);
    const result = await executeCompiled(compiled, { page: 1, pageSize: def.limit });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(report.name.slice(0, 30) || "Report");

    if (result.kind === "list") {
      const columns = def.columns.length ? def.columns : Object.keys(reg.fields).slice(0, 8);
      const headers = columns.map((k) => reg.fields[k]?.label ?? k);
      ws.addRow(headers);
      for (const row of result.rows) {
        ws.addRow(columns.map((k) => {
          const v = getByPath(row, reg.fields[k]?.prismaPath ?? k);
          return v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : v);
        }));
      }
      headers.forEach((_, i) => { ws.getColumn(i + 1).width = 20; });
    } else {
      const dims = def.groupBy;
      const headers = [...dims.map((k) => reg.fields[k]?.label ?? k), "Count", ...(compiled.kind === "aggregate" && compiled._sum ? Object.keys(compiled._sum) : [])];
      ws.addRow(headers);
      for (const g of result.groups) {
        const countObj = g._count as unknown;
        const count = typeof countObj === "number" ? countObj : (countObj as { _all?: number })?._all ?? "";
        const sumObj = (g._sum ?? {}) as Record<string, unknown>;
        ws.addRow([...dims.map((k) => g[reg.fields[k]?.prismaPath ?? k] ?? ""), count, ...Object.values(sumObj)]);
      }
      headers.forEach((_, i) => { ws.getColumn(i + 1).width = 22; });
    }
    ws.getRow(1).font = { bold: true };

    // Audit the export (actor + report).
    await prisma.activity.create({
      data: {
        entity_type: "User",
        entity_id: session.user.id,
        action: "report_export",
        actor_id: session.user.id,
        metadata: { report_id: report.id, name: report.name, entity: def.entity, mode: def.mode },
      },
    });

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${report.name.replace(/[^a-z0-9]+/gi, "_")}.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof ReportCompileError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("GET /api/reports/custom/[id]/export:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
