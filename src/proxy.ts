import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, resolveSessionSecret, verifySessionToken } from "@/lib/auth/session-token";

/**
 * Runs before page routes (NOT before /api – see matcher):
 *  - per-request CSP nonce,
 *  - redirect unauthenticated users away from protected pages,
 *  - redirect authenticated users away from auth pages.
 * API routes perform their own authentication in withApi(), which also
 * re-validates the user against the database.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/consultation"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const https = (process.env.APP_URL ?? "").startsWith("https://");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by UI primitives (e.g. progress bars).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected || isAuthPage) {
    const claims = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, resolveSessionSecret());
    if (isProtected && !claims) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    if (isAuthPage && claims) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (isProtected) response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
