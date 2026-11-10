import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/types/domain";

/**
 * Stateless session token (HS256 JWT) stored in an HttpOnly, Secure,
 * SameSite=Strict cookie. Contains identifiers only – no clinical data.
 * This module is runtime-agnostic (used by proxy.ts and route handlers).
 */
export const SESSION_COOKIE = "scribmed_session";
const ISSUER = "scribmed-ro";
const AUDIENCE = "scribmed-ro-app";

export interface SessionClaims {
  sub: string;
  org: string;
  role: Role;
  email: string;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims, secret: string, ttlHours: number): Promise<string> {
  return new SignJWT({ org: claims.org, role: claims.role, email: claims.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined | null, secret: string): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.org !== "string" || typeof payload.email !== "string") return null;
    const role = payload.role;
    if (role !== "owner" && role !== "admin" && role !== "doctor") return null;
    return { sub: payload.sub, org: payload.org, role, email: payload.email };
  } catch {
    return null;
  }
}

/** Secret resolution usable outside the validated env module (proxy). */
export function resolveSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET lipsește");
  return "dev-only-insecure-session-secret-change-me-0123456789";
}
