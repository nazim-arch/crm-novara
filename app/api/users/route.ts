import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { createUserSchema } from "@/lib/validations/auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";
import { welcomeUser } from "@/lib/email-templates";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.dealstackhq.com";

export async function GET() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      short_name: true,
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

  const { short_name, name, email, role, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  // Generate a random unusable password — user must set their own via the invite link
  const password_hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);

  const user = await prisma.user.create({
    data: { short_name, name, email, password_hash, role, phone: phone || null },
    select: { id: true, short_name: true, name: true, email: true, role: true, is_active: true, created_at: true },
  });

  // Issue a 7-day invite token and send the welcome email
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      token,
      user_id: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const setPasswordUrl = `${APP_URL}/reset-password?token=${token}`;
  const tpl = welcomeUser({ recipientName: name, setPasswordUrl });
  // Send synchronously so the caller knows if delivery failed
  await sendEmail({ to: email, ...tpl });

  return NextResponse.json({ data: user }, { status: 201 });
}
