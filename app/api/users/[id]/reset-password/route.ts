import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import bcrypt from "bcryptjs";
import { z } from "zod";

type Params = Promise<{ id: string }>;

const schema = z.object({ new_password: z.string().min(8) });

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    const password_hash = await bcrypt.hash(parsed.data.new_password, 12);
    await prisma.user.update({ where: { id }, data: { password_hash } });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("POST /api/users/[id]/reset-password:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
