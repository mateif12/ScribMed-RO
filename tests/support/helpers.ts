import { NextRequest } from "next/server";
import { resetEnvCache } from "@/config/env";
import { setClinicalNoteProvider } from "@/lib/ai";
import { setIdentityProvider } from "@/lib/auth/providers";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, signSessionToken } from "@/lib/auth/session-token";
import { setRepository } from "@/lib/database";
import { MemoryRepository } from "@/lib/database/memory-repository";
import { setNerProvider } from "@/lib/security/ner";
import { setRateLimiter } from "@/lib/security/rate-limit";
import { setSpeechProvider } from "@/lib/speech";
import type { User } from "@/types/domain";

export const ORIGIN = "http://localhost:3000";
export const TEST_PASSWORD = "Parola-Test-2026!";

/** Fresh in-memory world with two independent organisations (tenants). */
export async function setupWorld() {
  resetEnvCache();
  setSpeechProvider(null);
  setClinicalNoteProvider(null);
  setIdentityProvider(null);
  setNerProvider(null);
  setRateLimiter(null);
  const repo = new MemoryRepository();
  setRepository(repo);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const a = await repo.createOrganizationWithOwner({
    organization: { name: "Clinica Alfa", city: "Iași" },
    owner: { email: "owner.a@example.test", passwordHash },
    profile: { fullName: "Dr. Alfa Owner", specialty: "medicina_generala" },
  });
  const b = await repo.createOrganizationWithOwner({
    organization: { name: "Clinica Beta", city: "Timișoara" },
    owner: { email: "owner.b@example.test", passwordHash },
    profile: { fullName: "Dr. Beta Owner", specialty: "medicina_generala" },
  });
  const doctorA = await repo.addUser(
    { organizationId: a.organization.id },
    { email: "doctor.a@example.test", role: "doctor", passwordHash },
    { fullName: "Dr. Alfa Doctor", specialty: "medicina_generala" },
  );
  return { repo, a, b, doctorA };
}

export async function sessionCookieFor(user: User): Promise<string> {
  const token = await signSessionToken(
    { sub: user.id, org: user.organizationId, role: user.role, email: user.email },
    process.env.SESSION_SECRET!,
    1,
  );
  return `${SESSION_COOKIE}=${token}`;
}

export function makeRequest(
  path: string,
  init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string>; cookie?: string; csrf?: boolean } = {},
): NextRequest {
  const headers = new Headers(init.headers ?? {});
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  const method = init.method ?? (init.json !== undefined || init.body !== undefined ? "POST" : "GET");
  if (method !== "GET" && init.csrf !== false) {
    headers.set("origin", ORIGIN);
    headers.set("x-scribmed-request", "1");
  }
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
  return new NextRequest(new URL(path, ORIGIN), { method, headers, body, ...(body ? { duplex: "half" } : {}) } as ConstructorParameters<typeof NextRequest>[1]);
}

/** Minimal valid WebM container header followed by padding. */
export function fakeWebm(size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
}

export async function readNdjson(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
