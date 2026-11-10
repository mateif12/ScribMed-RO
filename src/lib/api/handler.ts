import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getAllowedOrigins } from "@/config/env";
import { resolveAuthContext } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/session-token";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { safeLog } from "@/lib/security/logger";
import type { AuthContext, Role } from "@/types/domain";
import { AppError, isAppError } from "./errors";

/** Header required on every state-changing API request (CSRF defence in depth). */
export const CSRF_HEADER = "x-scribmed-request";

export interface RateLimitSpec {
  name: string;
  limit: number;
  windowMs: number;
  /** "user" keys by authenticated user, "ip" by client address. */
  by: "user" | "ip";
}

export interface ApiOptions {
  auth: boolean;
  roles?: readonly Role[];
  rateLimit?: RateLimitSpec | (() => RateLimitSpec);
  /** Max JSON body size in bytes (checked via Content-Length and actual length). */
  maxJsonBytes?: number;
}

export interface ApiContext {
  request: NextRequest;
  auth: AuthContext | null;
}

type Handler = (ctx: ApiContext) => Promise<Response>;

const NO_STORE = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } as const;

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...(init.headers ?? {}) } });
}

export function errorResponse(err: AppError, headers: Record<string, string> = {}): NextResponse {
  return jsonResponse({ error: { code: err.code, message: err.message } }, { status: err.status, headers });
}

function clientIp(req: NextRequest): string {
  // Trust X-Forwarded-For only behind a known proxy/load balancer (see docs/security.md).
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Same-origin enforcement for state-changing requests:
 *  1. Origin header (or Sec-Fetch-Site) must match an allowed origin.
 *  2. A custom header must be present – cross-origin requests cannot set it
 *     without a CORS preflight, which this API never approves.
 * Combined with SameSite=Strict session cookies this mitigates CSRF.
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  const allowed = getAllowedOrigins();
  const requestOrigin = new URL(req.url).origin;
  if (origin) {
    if (origin !== requestOrigin && !allowed.includes(origin)) {
      throw new AppError("CSRF_REJECTED", "Cerere respinsă (origine nepermisă).");
    }
  } else {
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      throw new AppError("CSRF_REJECTED", "Cerere respinsă (origine nepermisă).");
    }
  }
  if (req.headers.get(CSRF_HEADER) !== "1") {
    throw new AppError("CSRF_REJECTED", "Cerere respinsă (antet de securitate lipsă).");
  }
}

/** Parses and size-limits a JSON body. */
export async function readJson(req: NextRequest, maxBytes = 64 * 1024): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Se acceptă doar application/json.");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Cererea este prea mare.");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Cererea este prea mare.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Corpul cererii nu este JSON valid.");
  }
}

/**
 * Wraps an API route: auth, role checks, CSRF, rate limiting, uniform error
 * handling and privacy-safe logging. Error responses never echo request data.
 */
export function withApi(options: ApiOptions, handler: Handler) {
  return async (request: NextRequest): Promise<Response> => {
    const started = Date.now();
    const route = new URL(request.url).pathname;
    let auth: AuthContext | null = null;
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
      if (mutating) assertSameOrigin(request);

      if (options.auth) {
        auth = await resolveAuthContext(request.cookies.get(SESSION_COOKIE)?.value);
        if (!auth) throw new AppError("UNAUTHENTICATED", "Sesiunea a expirat. Autentificați-vă din nou.");
        if (options.roles && !options.roles.includes(auth.role)) {
          throw new AppError("FORBIDDEN", "Nu aveți permisiunea necesară pentru această acțiune.");
        }
      }

      if (options.rateLimit) {
        const spec = typeof options.rateLimit === "function" ? options.rateLimit() : options.rateLimit;
        const subject = spec.by === "user" && auth ? `u:${auth.userId}` : `ip:${clientIp(request)}`;
        const rl = getRateLimiter().check(`${spec.name}:${subject}`, spec.limit, spec.windowMs);
        if (!rl.allowed) {
          const err = new AppError("RATE_LIMITED", "Prea multe cereri. Reîncercați mai târziu.");
          return errorResponse(err, { "Retry-After": String(rl.retryAfterSeconds) });
        }
      }

      const res = await handler({ request, auth });
      safeLog.info({ event: "api_request", route, method: request.method, status: res.status, durationMs: Date.now() - started, organizationId: auth?.organizationId });
      return res;
    } catch (err) {
      if (isAppError(err)) {
        safeLog.warn({ event: "api_error", route, method: request.method, status: err.status, code: err.code, durationMs: Date.now() - started });
        return errorResponse(err);
      }
      // Unknown errors: log only the error class name, never message/stack (may contain data).
      safeLog.error({ event: "api_unhandled_error", route, method: request.method, code: (err as Error)?.name ?? "Unknown", durationMs: Date.now() - started });
      return errorResponse(new AppError("INTERNAL_ERROR", "A apărut o eroare neașteptată."));
    }
  };
}

/** Strict CORS: only explicitly configured extra origins receive CORS headers. */
export function corsPreflight(request: NextRequest): Response {
  const origin = request.headers.get("origin");
  const allowed = getAllowedOrigins();
  if (!origin || !allowed.includes(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PATCH",
      "Access-Control-Allow-Headers": `content-type, ${CSRF_HEADER}`,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}
