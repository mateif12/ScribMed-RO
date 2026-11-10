import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { POST as events } from "@/app/api/consultation/events/route";
import { POST as generateNote } from "@/app/api/generate-note/route";
import { GET as health } from "@/app/api/health/route";
import { GET as getProfile, PATCH as patchProfile } from "@/app/api/user/profile/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { setClinicalNoteProvider } from "@/lib/ai";
import type { ClinicalNoteProvider } from "@/lib/ai/types";
import { SESSION_COOKIE } from "@/lib/auth/session-token";
import { MemoryRateLimiter, setRateLimiter } from "@/lib/security/rate-limit";
import { TEST_PASSWORD, fakeWebm, makeRequest, readNdjson, sessionCookieFor, setupWorld } from "../support/helpers";

let world: Awaited<ReturnType<typeof setupWorld>>;
let cookieA: string;

beforeEach(async () => {
  world = await setupWorld();
  cookieA = await sessionCookieFor(world.a.user);
});

describe("GET /api/health", () => {
  it("reports status and provider modes without secrets", async () => {
    const res = await health();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", providers: { speech: "mock", notes: "mock" } });
    expect(JSON.stringify(body)).not.toMatch(/secret|key/i);
  });
});

describe("authentication API", () => {
  it("logs in with valid credentials and sets a hardened session cookie", async () => {
    const res = await login(makeRequest("/api/auth/login", { json: { email: "owner.a@example.test", password: TEST_PASSWORD } }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects invalid credentials with a generic message", async () => {
    const res = await login(makeRequest("/api/auth/login", { json: { email: "owner.a@example.test", password: "Gresita-123!" } }));
    expect(res.status).toBe(401);
    const unknown = await login(makeRequest("/api/auth/login", { json: { email: "nobody@example.test", password: "Gresita-123!" } }));
    expect((await unknown.json()).error.message).toBe((await res.json()).error.message);
  });

  it("validates the request body strictly", async () => {
    const res = await login(makeRequest("/api/auth/login", { json: { email: "nu-e-email", password: "x", extra: true } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-JSON bodies", async () => {
    const res = await login(makeRequest("/api/auth/login", { body: "email=x", headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(415);
  });

  it("CSRF: rejects missing custom header and foreign origins", async () => {
    const noHeader = await login(makeRequest("/api/auth/login", { json: { email: "a@b.ro", password: "x" }, csrf: false }));
    expect(noHeader.status).toBe(403);
    const foreign = await login(
      makeRequest("/api/auth/login", {
        json: { email: "a@b.ro", password: "x" },
        csrf: false,
        headers: { origin: "https://evil.example", "x-scribmed-request": "1" },
      }),
    );
    expect(foreign.status).toBe(403);
    expect((await foreign.json()).error.code).toBe("CSRF_REJECTED");
  });

  it("rate-limits repeated login attempts", async () => {
    setRateLimiter(new MemoryRateLimiter());
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      last = await login(makeRequest("/api/auth/login", { json: { email: "owner.a@example.test", password: "Gresita-123!" } }));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });

  it("registers a new organisation and logs the owner in", async () => {
    const res = await register(
      makeRequest("/api/auth/register", {
        json: {
          fullName: "Dr. Gama Nou",
          email: "gama@example.test",
          password: "Parola-Noua-2026!",
          clinicName: "Clinica Gama",
          city: "Brașov",
          specialty: "medicina_generala",
          acceptTerms: true,
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    const user = await world.repo.findUserByEmail("gama@example.test");
    expect(user?.role).toBe("owner");
    expect(user?.organizationId).not.toBe(world.a.organization.id);
  });

  it("rejects weak passwords and duplicate e-mails on registration", async () => {
    const base = { fullName: "Dr. X", clinicName: "Clinica X", specialty: "medicina_generala", acceptTerms: true };
    const weak = await register(makeRequest("/api/auth/register", { json: { ...base, email: "x@example.test", password: "slaba" } }));
    expect(weak.status).toBe(400);
    const dup = await register(makeRequest("/api/auth/register", { json: { ...base, email: "owner.a@example.test", password: "Parola-Noua-2026!" } }));
    expect(dup.status).toBe(409);
  });

  it("password reset flow (mock provider) works and does not reveal account existence", async () => {
    const unknown = await (await forgot(makeRequest("/api/auth/forgot-password", { json: { email: "nobody@example.test" } }))).json();
    const known = await (await forgot(makeRequest("/api/auth/forgot-password", { json: { email: "owner.a@example.test" } }))).json();
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(known).sort());
    const bad = await reset(makeRequest("/api/auth/reset-password", { json: { email: "owner.a@example.test", code: "000000", newPassword: "Parola-Noua-2026!" } }));
    expect([400]).toContain(bad.status);
    // re-request to get a fresh code (previous one may have been consumed by attempts)
    const fresh = await (await forgot(makeRequest("/api/auth/forgot-password", { json: { email: "owner.a@example.test" } }))).json();
    const ok = await reset(makeRequest("/api/auth/reset-password", { json: { email: "owner.a@example.test", code: fresh.devCode, newPassword: "Parola-Noua-2026!" } }));
    expect(ok.status).toBe(200);
    const relog = await login(makeRequest("/api/auth/login", { json: { email: "owner.a@example.test", password: "Parola-Noua-2026!" } }));
    expect(relog.status).toBe(200);
  });

  it("logout clears the cookie", async () => {
    const res = await logout(makeRequest("/api/auth/logout", { method: "POST", cookie: cookieA }));
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("protected endpoints require a valid session", async () => {
    expect((await getProfile(makeRequest("/api/user/profile"))).status).toBe(401);
    expect((await getProfile(makeRequest("/api/user/profile", { cookie: `${SESSION_COOKIE}=forged.token.value` }))).status).toBe(401);
  });

  it("a session for a deactivated user is rejected", async () => {
    world.a.user.isActive = false;
    expect((await getProfile(makeRequest("/api/user/profile", { cookie: cookieA }))).status).toBe(401);
  });
});

describe("profile API", () => {
  it("GET returns the caller's profile, organisation and subscription", async () => {
    const res = await getProfile(makeRequest("/api/user/profile", { cookie: cookieA }));
    const body = await res.json();
    expect(body.profile.fullName).toBe("Dr. Alfa Owner");
    expect(body.organization.name).toBe("Clinica Alfa");
    expect(body.subscription.plan).toBe("trial");
  });

  it("PATCH updates profile and validates input", async () => {
    const ok = await patchProfile(makeRequest("/api/user/profile", { method: "PATCH", json: { title: "Medic primar", stampCode: "A12345" }, cookie: cookieA }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).profile.title).toBe("Medic primar");
    const bad = await patchProfile(makeRequest("/api/user/profile", { method: "PATCH", json: { specialty: "astrologie" }, cookie: cookieA }));
    expect(bad.status).toBe(400);
    const empty = await patchProfile(makeRequest("/api/user/profile", { method: "PATCH", json: {}, cookie: cookieA }));
    expect(empty.status).toBe(400);
  });

  it("only owners/admins can change organisation data", async () => {
    const doctorCookie = await sessionCookieFor(world.doctorA);
    const res = await patchProfile(makeRequest("/api/user/profile", { method: "PATCH", json: { organization: { name: "Altă clinică" } }, cookie: doctorCookie }));
    expect(res.status).toBe(403);
    const owner = await patchProfile(makeRequest("/api/user/profile", { method: "PATCH", json: { organization: { name: "Clinica Alfa Plus" } }, cookie: cookieA }));
    expect((await owner.json()).organization.name).toBe("Clinica Alfa Plus");
  });
});

describe("POST /api/transcribe", () => {
  const post = (body: Uint8Array, headers: Record<string, string> = {}, cookie = cookieA) =>
    transcribe(
      makeRequest("/api/transcribe", {
        body: body as unknown as BodyInit,
        headers: { "content-type": "audio/webm", "content-length": String(body.byteLength), "x-audio-duration": "600", ...headers },
        cookie,
      }),
    );

  it("streams progress stages and returns a REDACTED transcript (mock provider)", async () => {
    const res = await post(fakeWebm(4097));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const ev = await readNdjson(res);
    expect(ev.map((e) => e.stage)).toEqual(["received", "transcribing", "redacting", "done"]);
    const result = ev[3]!.result as { transcript: string; redactionTotal: number; provider: string };
    expect(result.provider).toBe("mock");
    expect(result.transcript.length).toBeGreaterThan(100);
    expect(result.transcript).not.toMatch(/1840512400123|0712345678|Marinescu/);
  });

  it("requires authentication", async () => {
    const res = await transcribe(makeRequest("/api/transcribe", { body: fakeWebm() as unknown as BodyInit, headers: { "content-type": "audio/webm" } }));
    expect(res.status).toBe(401);
  });

  it("rejects unsupported MIME types, spoofed content and empty audio", async () => {
    expect((await post(fakeWebm(), { "content-type": "application/pdf" })).status).toBe(415);
    expect((await post(new TextEncoder().encode("x".repeat(4096)))).status).toBe(415);
    expect((await post(fakeWebm(100))).status).toBe(400);
  });

  it("enforces the size limit via Content-Length and actual body size", async () => {
    const big = fakeWebm(2 * 1024 * 1024 + 10);
    expect((await post(big)).status).toBe(413);
    const lying = await transcribe(
      makeRequest("/api/transcribe", { body: big as unknown as BodyInit, headers: { "content-type": "audio/webm" }, cookie: cookieA }),
    );
    expect(lying.status).toBe(413);
  });

  it("detects truncated uploads", async () => {
    const res = await post(fakeWebm(4096), { "content-length": "9000" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate-note", () => {
  it("returns a six-section note, the disclaimer and no-store headers", async () => {
    const res = await generateNote(
      makeRequest("/api/generate-note", {
        json: { transcript: "Pacient: Mă doare gâtul de trei zile.\nDoctor: Faringele este congestionat.", specialty: "medicina_generala" },
        cookie: cookieA,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(Object.keys(body.sections)).toEqual(["motive", "istoric", "antecedente", "examen", "diagnostic", "plan"]);
    expect(body.sections.diagnostic).toBe("Nespecificat de medic");
    expect(body.disclaimer).toContain("Necesită verificarea și validarea medicului curant");
  });

  it("never sends unredacted identifiers to the LLM provider, even if the client sends them", async () => {
    let received = "";
    const spy: ClinicalNoteProvider = {
      name: "spy",
      async generateNote(t) {
        received = t;
        return "1. MOTIVELE PREZENTĂRII\nCefalee";
      },
    };
    setClinicalNoteProvider(spy);
    const res = await generateNote(
      makeRequest("/api/generate-note", {
        json: { transcript: "Pacient: Mă numesc Ion Popescu, CNP 1840512400123, tel 0712345678, mail ion@example.com. Am cefalee." },
        cookie: cookieA,
      }),
    );
    expect(res.status).toBe(200);
    expect(received).not.toMatch(/Popescu|1840512400123|0712345678|ion@example\.com/);
    expect(received).toContain("[CNP_ELIMINAT]");
    expect(received).toContain("cefalee");
    const body = await res.json();
    expect(body.warnings.map((w: { code: string }) => w.code)).toContain("MISSING_SECTION");
  });

  it("validates input", async () => {
    const short = await generateNote(makeRequest("/api/generate-note", { json: { transcript: "scurt" }, cookie: cookieA }));
    expect(short.status).toBe(400);
    const badSpecialty = await generateNote(makeRequest("/api/generate-note", { json: { transcript: "x".repeat(50), specialty: "nimic" }, cookie: cookieA }));
    expect(badSpecialty.status).toBe(400);
    const unauth = await generateNote(makeRequest("/api/generate-note", { json: { transcript: "x".repeat(50) } }));
    expect(unauth.status).toBe(401);
  });

  it("maps provider refusals to a safe error", async () => {
    const { NoteProviderError } = await import("@/lib/ai/types");
    setClinicalNoteProvider({
      name: "refuser",
      async generateNote() {
        throw new NoteProviderError("Modelul a refuzat generarea fișei pentru această transcriere.", "refusal");
      },
    });
    const res = await generateNote(makeRequest("/api/generate-note", { json: { transcript: "Pacient: tuse de trei zile, fără febră." }, cookie: cookieA }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("PROVIDER_REFUSAL");
  });
});

describe("POST /api/consultation/events", () => {
  it("requires patient-information confirmation to record a consultation start", async () => {
    const no = await events(makeRequest("/api/consultation/events", { json: { type: "consultation_started" }, cookie: cookieA }));
    expect(no.status).toBe(400);
    const yes = await events(makeRequest("/api/consultation/events", { json: { type: "consultation_started", patientInformed: true }, cookie: cookieA }));
    expect(yes.status).toBe(200);
  });

  it("records session deletion as content-free operational metadata", async () => {
    const res = await events(makeRequest("/api/consultation/events", { json: { type: "session_cleared" }, cookie: cookieA }));
    expect(res.status).toBe(200);
    const recent = await world.repo.listRecentUsageEvents({ organizationId: world.a.organization.id }, { limit: 5 });
    expect(recent[0]?.type).toBe("session_cleared");
  });

  it("rejects free-text payloads (no clinical content can be smuggled in)", async () => {
    const res = await events(makeRequest("/api/consultation/events", { json: { type: "session_cleared", note: "diagnostic: ..." }, cookie: cookieA }));
    expect(res.status).toBe(400);
  });
});
