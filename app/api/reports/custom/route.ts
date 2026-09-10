import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import type { Prisma } from "@/lib/generated/prisma/client";
import { savedReportCreateSchema } from "@/lib/reports/definition";

// Admin-only. Saved reports are personal — always scoped to owner_id = self.
async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "Admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId: session.user.id };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const reports = await prisma.savedReport.findMany({
    where: { owner_id: gate.userId },
    select: { id: true, name: true, entity: true, created_at: true, updated_at: true },
    orderBy: { updated_at: "desc" },
  });
  return NextResponse.json({ data: reports });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await request.json();
  const parsed = savedReportCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, entity, definition } = parsed.data;
  const report = await prisma.savedReport.create({
    data: { owner_id: gate.userId!, name, entity, definition: definition as unknown as Prisma.InputJsonValue },
    select: { id: true, name: true, entity: true, created_at: true, updated_at: true },
  });
  return NextResponse.json({ data: report }, { status: 201 });
}
