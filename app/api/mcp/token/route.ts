import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { ratelimit } from "@/lib/rate-limit";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function POST(request: Request) {
  try {
    const rl = await ratelimit(request, 5, "15 m", "mcp-token");
    if (!rl.success) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { email, password } = body as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, role: true, password_hash: true, is_active: true },
    });

    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (user.role !== "Admin") {
      return NextResponse.json(
        { error: "Only Admin users can generate MCP tokens" },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const token = await new SignJWT({ mcp: true, role: user.role, name: user.name })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);

    return NextResponse.json({
      token,
      expires_at: expiresAt.toISOString(),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("POST /api/mcp/token:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
