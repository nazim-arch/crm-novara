import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { updateUserSchema } from "@/lib/validations/auth";
import { z } from "zod";
import bcrypt from "bcryptjs";

const changePasswordApiSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

type Params = Promise<{ id: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = hasPermission(session.user.role, "user:manage");
  const isSelf = session.user.id === id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  // Password change flow
  if (body.current_password !== undefined) {
    const parsed = changePasswordApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const valid = await bcrypt.compare(parsed.data.current_password, user.password_hash);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    const password_hash = await bcrypt.hash(parsed.data.new_password, 12);
    await prisma.user.update({ where: { id }, data: { password_hash } });
    return NextResponse.json({ data: { success: true } });
  }

  // General update
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const { short_name, name, phone, role, is_active } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone || null;
  if (short_name !== undefined) updateData.short_name = short_name;
  if (isAdmin && role !== undefined) updateData.role = role;
  if (isAdmin && is_active !== undefined) updateData.is_active = is_active;

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, short_name: true, name: true, email: true, role: true, is_active: true, phone: true },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    if (session.user.id === id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/users/[id]:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
