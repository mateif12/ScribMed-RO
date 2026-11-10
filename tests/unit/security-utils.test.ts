import { describe, expect, it, vi } from "vitest";
import { hashPassword, isStrongPassword, verifyPassword } from "@/lib/auth/password";
import { signSessionToken, verifySessionToken } from "@/lib/auth/session-token";
import { safeLog, type SafeLogFields } from "@/lib/security/logger";
import { MemoryRateLimiter } from "@/lib/security/rate-limit";

const SECRET = "a".repeat(40);

describe("session tokens (authentication)", () => {
  const claims = { sub: "u1", org: "o1", role: "doctor" as const, email: "d@example.test" };

  it("round-trips valid claims", async () => {
    const token = await signSessionToken(claims, SECRET, 1);
    expect(await verifySessionToken(token, SECRET)).toEqual(claims);
  });
  it("rejects a token signed with another secret", async () => {
    const token = await signSessionToken(claims, SECRET, 1);
    expect(await verifySessionToken(token, "b".repeat(40))).toBeNull();
  });
  it("rejects a tampered payload (e.g. switching organisation)", async () => {
    const token = await signSessionToken(claims, SECRET, 1);
    const [h, p, s] = token.split(".");
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
    payload.org = "other-org";
    const forged = [h, Buffer.from(JSON.stringify(payload)).toString("base64url"), s].join(".");
    expect(await verifySessionToken(forged, SECRET)).toBeNull();
  });
  it("rejects expired tokens", async () => {
    vi.useFakeTimers();
    const token = await signSessionToken(claims, SECRET, 1);
    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
    expect(await verifySessionToken(token, SECRET)).toBeNull();
    vi.useRealTimers();
  });
  it("rejects garbage and missing tokens", async () => {
    expect(await verifySessionToken("not.a.jwt", SECRET)).toBeNull();
    expect(await verifySessionToken(undefined, SECRET)).toBeNull();
  });
});

describe("password hashing", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashPassword("Parola-Corecta-1!");
    expect(h.startsWith("scrypt")).toBe(true);
    expect(await verifyPassword("Parola-Corecta-1!", h)).toBe(true);
    expect(await verifyPassword("gresita", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
  it("enforces password policy", () => {
    expect(isStrongPassword("Parola-Corecta-1!")).toBe(true);
    expect(isStrongPassword("scurta1!A")).toBe(false);
    expect(isStrongPassword("faraspecial1A")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("limits per key and resets after the window", () => {
    let now = 0;
    const rl = new MemoryRateLimiter(() => now);
    expect(rl.check("k", 2, 1000).allowed).toBe(true);
    expect(rl.check("k", 2, 1000).allowed).toBe(true);
    const blocked = rl.check("k", 2, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rl.check("other", 2, 1000).allowed).toBe(true);
    now = 1001;
    expect(rl.check("k", 2, 1000).allowed).toBe(true);
  });
});

describe("privacy-safe logger", () => {
  it("drops non-allow-listed fields such as transcripts or notes", () => {
    const fields = { event: "x", status: 200, transcript: "CNP 1840512400123", note: "diagnostic" } as unknown as SafeLogFields;
    const out = safeLog.sanitize(fields);
    expect(out).toEqual({ event: "x", status: 200 });
    expect(JSON.stringify(out)).not.toContain("1840512400123");
  });
  it("neutralises free text in string fields", () => {
    expect(safeLog.sanitize({ event: "a b\nc{}" }).event).toBe("a_b_c__");
  });
});
