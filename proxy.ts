import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ratelimit } from "@/lib/rate-limit";

function noIndex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

type RateLimitRule = { limit: number; window: string; prefix: string };

function getRule(pathname: string, method: string): RateLimitRule {
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Rate limiting — all /api/* except health & inngest webhooks ───────
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/health") &&
    !pathname.startsWith("/api/inngest") &&
    !pathname.startsWith("/api/meta-leads")
  ) {
    const { limit, window, prefix } = getRule(pathname, req.method);
    const { success, limit: lim, remaining, reset } = await ratelimit(
      req,
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
  }

  // ── Protect cron routes with secret ──────────────────────────────────
  if (pathname.startsWith("/api/cron")) {
    const authorization = req.headers.get("authorization");
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return noIndex(NextResponse.next());
  }

  // ── Skip auth check for auth API routes, health, and static files ────
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/inngest") ||
    pathname.startsWith("/api/meta-leads") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return noIndex(NextResponse.next());
  }

  let isAuthenticated = false;
  let token: Awaited<ReturnType<typeof getToken>> = null;
  try {
    // next-auth v5 uses "authjs.session-token" (or __Secure- prefix on HTTPS)
    const secureCookie = req.nextUrl.protocol === "https:";
    const cookieName = secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      cookieName,
    });
    isAuthenticated = !!token;
  } catch {
    isAuthenticated = false;
  }

  const role = token?.role as string | undefined;
  const landingPage = role === "Sales"
    ? "/follow-ups?tab=focus_queue"
    : "/dashboard/crm";

  // Redirect authenticated users away from login
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL(landingPage, req.url));
  }

  // Redirect root
  if (pathname === "/") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL(landingPage, req.url));
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Public auth routes — no login required
  const publicRoutes = ["/login", "/forgot-password", "/reset-password"];
  if (publicRoutes.includes(pathname) || publicRoutes.some(r => pathname.startsWith(r))) {
    return noIndex(NextResponse.next());
  }

  // Protect all other routes
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return noIndex(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
