import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const createClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  industry: z.string().optional().or(z.literal("")),
  contact_person: z.string().optional().or(z.literal("")),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clients = await prisma.client.findMany({
      where: { is_active: true },
      select: { id: true, name: true, industry: true, contact_person: true, contact_email: true, contact_phone: true, notes: true, is_active: true, created_at: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: clients });
  } catch (error) {
    console.error("GET /api/clients:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { name, industry, contact_person, contact_email, contact_phone, notes } = parsed.data;

    const client = await prisma.client.create({
      data: {
        name,
        industry: industry || null,
        contact_person: contact_person || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ data: client }, { status: 201 });
  } catch (error) {
    console.error("POST /api/clients:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
