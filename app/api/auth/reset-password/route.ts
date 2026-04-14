import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, is_active: true } } },
    });

    if (!record || !record.user.is_active) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    if (record.expires_at < new Date()) {
      await prisma.passwordResetToken.delete({ where: { token } });
      return NextResponse.json({ error: "Reset link has expired. Please request a new one." }, { status: 400 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.user_id },
        data: { password_hash, updated_at: new Date() },
      }),
      prisma.passwordResetToken.delete({ where: { token } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/reset-password:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
