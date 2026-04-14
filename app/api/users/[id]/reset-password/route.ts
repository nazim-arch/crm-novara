import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";
import { passwordReset } from "@/lib/email-templates";

type Params = Promise<{ id: string }>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.dealstackhq.com";

// Admin action: send a password reset link to a user
export async function POST(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, is_active: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Replace any existing token for this user
    await prisma.passwordResetToken.deleteMany({ where: { user_id: id } });

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        token,
        user_id: id,
        expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const tpl = passwordReset({ recipientName: user.name, resetUrl });
    await sendEmail({ to: user.email, ...tpl });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("POST /api/users/[id]/reset-password:", error);
    return NextResponse.json({ error: "Failed to send reset link" }, { status: 500 });
  }
}
