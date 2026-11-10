import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getEnv, getSessionSecret } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { getRepository } from "@/lib/database";
import type { AuthContext, Role, User } from "@/types/domain";
import { SESSION_COOKIE, signSessionToken, verifySessionToken } from "./session-token";

function cookieOptions(maxAgeSeconds: number) {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.APP_URL.startsWith("https://"),
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function issueSession(response: NextResponse, user: User): Promise<void> {
  const env = getEnv();
  const token = await signSessionToken(
    { sub: user.id, org: user.organizationId, role: user.role, email: user.email },
    getSessionSecret(),
    env.SESSION_TTL_HOURS,
  );
  response.cookies.set(SESSION_COOKIE, token, cookieOptions(env.SESSION_TTL_HOURS * 3600));
}

export function clearSession(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
}

/**
 * Resolves a token into an AuthContext. The token is verified AND the user row
 * is re-loaded, so deactivated users or changed roles take effect immediately,
 * and a token can never grant access to an organisation the user no longer
 * belongs to.
 */
export async function resolveAuthContext(token: string | undefined | null): Promise<AuthContext | null> {
  const claims = await verifySessionToken(token, getSessionSecret());
  if (!claims) return null;
  const repo = await getRepository();
  const user = await repo.findUserById(claims.sub);
  if (!user || !user.isActive || user.organizationId !== claims.org) return null;
  return { userId: user.id, organizationId: user.organizationId, role: user.role, email: user.email };
}

/** For Server Components / pages. */
export async function getCurrentAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  return resolveAuthContext(store.get(SESSION_COOKIE)?.value);
}

export function requireRole(ctx: AuthContext, roles: readonly Role[]): void {
  if (!roles.includes(ctx.role)) {
    throw new AppError("FORBIDDEN", "Nu aveți permisiunea necesară pentru această acțiune.");
  }
}
