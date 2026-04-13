import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect cron routes with secret
  if (pathname.startsWith("/api/cron")) {
    const authorization = req.headers.get("authorization");
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Skip auth check for auth API routes, health, and static files
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/health") || pathname.startsWith("/api/inngest") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  let isAuthenticated = false;
  try {
    // next-auth v5 uses "authjs.session-token" (or __Secure- prefix on HTTPS)
    const secureCookie = req.nextUrl.protocol === "https:";
    const cookieName = secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      cookieName,
    });
    isAuthenticated = !!token;
  } catch {
    isAuthenticated = false;
  }

  // Redirect authenticated users away from login
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard/crm", req.url));
  }

  // Redirect root
  if (pathname === "/") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard/crm", req.url));
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Protect all non-login routes
  if (pathname !== "/login" && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
