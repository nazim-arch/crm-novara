import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";
import { passwordReset } from "@/lib/email-templates";

const schema = z.object({
  email: z.string().email(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.dealstackhq.com";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email, is_active: true },
      select: { id: true, name: true, email: true },
    });

    // Always return 200 — never reveal whether an email exists
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Delete any existing tokens for this user before creating a new one
    await prisma.passwordResetToken.deleteMany({ where: { user_id: user.id } });

    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { token, user_id: user.id, expires_at },
    });

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const tpl = passwordReset({ recipientName: user.name, resetUrl });
    await sendEmail({ to: user.email, ...tpl });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/forgot-password:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
