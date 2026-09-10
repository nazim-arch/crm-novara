import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { reportDefinitionSchema } from "@/lib/reports/definition";
import { compileReport, ReportCompileError } from "@/lib/reports/compile";
import { executeCompiled } from "@/lib/reports/run";
import { z } from "zod";

// Runs a report definition (inline) and returns rows/groups. Used for live
// preview of unsaved drafts AND for running a loaded saved report (the client
// already holds its definition). Admin-only.
const runSchema = z.object({
  definition: reportDefinitionSchema,
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = runSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  try {
    const compiled = compileReport(parsed.data.definition);
    const result = await executeCompiled(compiled, { page: parsed.data.page, pageSize: parsed.data.pageSize });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ReportCompileError) {
      return NextResponse.json({ error: err.message, code: "INVALID_REPORT" }, { status: 400 });
    }
    console.error("POST /api/reports/custom/run:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
