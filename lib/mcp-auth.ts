import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

export type McpUser = { userId: string; role: string; name: string };

export async function verifyMcpToken(
  request: Request
): Promise<{ valid: true } & McpUser | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.mcp || typeof payload.sub !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    return {
      valid: true,
      userId: payload.sub,
      role: payload.role as string,
      name: payload.name as string,
    };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}
