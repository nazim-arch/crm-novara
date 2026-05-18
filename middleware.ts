import { NextRequest, NextResponse } from "next/server";
import { ratelimit } from "@/lib/rate-limit";

// Only run on API routes
export const config = {
  matcher: ["/api/:path*"],
};

type RateLimitRule = { limit: number; window: string; prefix: string };

function getRule(pathname: string, method: string): RateLimitRule {
  // Most-specific rules first
  if (pathname.startsWith("/api/auth/")) {
    return { limit: 10, window: "1 m", prefix: "auth" };
  }
  if (pathname.startsWith("/api/leads/bulk-update") && method === "POST") {
    return { limit: 5, window: "1 m", prefix: "leads-bulk" };
  }
  if (pathname === "/api/leads" && method === "POST") {
    return { limit: 30, window: "1 m", prefix: "leads-create" };
  }
  if (pathname.startsWith("/api/intentradar")) {
    return { limit: 10, window: "1 m", prefix: "intentradar" };
  }
  return { limit: 60, window: "1 m", prefix: "api" };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { limit, window, prefix } = getRule(pathname, request.method);

  const { success, limit: lim, remaining, reset } = await ratelimit(
    request,
    limit,
    window,
    prefix
  );

  if (!success) {
    const retryAfter = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(lim),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
  }

  return NextResponse.next();
}
