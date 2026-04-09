import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { createUserSchema } from "@/lib/validations/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
      phone: true,
      created_at: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: users });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const { name, email, password, role, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, password_hash, role, phone },
    select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
  });

  return NextResponse.json({ data: user }, { status: 201 });
}
