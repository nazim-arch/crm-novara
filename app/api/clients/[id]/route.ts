import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

type Params = Promise<{ id: string }>;

const updateClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  industry: z.string().optional().or(z.literal("")),
  contact_person: z.string().optional().or(z.literal("")),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { industry, contact_person, contact_email, contact_phone, notes, ...rest } = parsed.data;
    const client = await prisma.client.update({
      where: { id },
      data: {
        ...rest,
        industry: industry === "" ? null : industry,
        contact_person: contact_person === "" ? null : contact_person,
        contact_email: contact_email === "" ? null : contact_email,
        contact_phone: contact_phone === "" ? null : contact_phone,
        notes: notes === "" ? null : notes,
      },
    });

    return NextResponse.json({ data: client });
  } catch (error) {
    console.error("PATCH /api/clients/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // Check if any tasks are linked to this client
    const taskCount = await prisma.task.count({ where: { client_id: id, deleted_at: null } });
    if (taskCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${taskCount} task(s) are linked to this client. Reassign them first.` },
        { status: 409 }
      );
    }

    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/clients/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
