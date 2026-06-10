import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";

export async function GET(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const users = await prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true, short_name: true, email: true, role: true, is_active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    console.error("GET /api/mcp/users:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
