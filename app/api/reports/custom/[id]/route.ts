import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import type { Prisma } from "@/lib/generated/prisma/client";
import { reportDefinitionSchema } from "@/lib/reports/definition";
import { z } from "zod";

type Params = Promise<{ id: string }>;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "Admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId: session.user.id };
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  definition: reportDefinitionSchema.optional(),
});

export async function GET(_req: Request, { params }: { params: Params }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;
  // Ownership enforced in the query → non-owner (or missing) yields 404.
  const report = await prisma.savedReport.findFirst({ where: { id, owner_id: gate.userId } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: report });
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;

  const existing = await prisma.savedReport.findFirst({ where: { id, owner_id: gate.userId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  const report = await prisma.savedReport.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.definition !== undefined ? { definition: parsed.data.definition as unknown as Prisma.InputJsonValue, entity: parsed.data.definition.entity } : {}),
    },
    select: { id: true, name: true, entity: true, updated_at: true },
  });
  return NextResponse.json({ data: report });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;

  const existing = await prisma.savedReport.findFirst({ where: { id, owner_id: gate.userId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.savedReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
