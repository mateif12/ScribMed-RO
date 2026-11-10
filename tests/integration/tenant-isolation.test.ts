import { beforeEach, describe, expect, it } from "vitest";
import { GET as members } from "@/app/api/organization/members/route";
import { GET as getProfile, PATCH as patchProfile } from "@/app/api/user/profile/route";
import { POST as events } from "@/app/api/consultation/events/route";
import { getDashboardData } from "@/services/profile-service";
import { makeRequest, sessionCookieFor, setupWorld } from "../support/helpers";

let world: Awaited<ReturnType<typeof setupWorld>>;

beforeEach(async () => {
  world = await setupWorld();
});

describe("tenant isolation – repository layer", () => {
  it("scoped lookups never return another organisation's rows", async () => {
    const { repo, a, b } = world;
    const scopeA = { organizationId: a.organization.id };
    expect(await repo.getUser(scopeA, b.user.id)).toBeNull();
    expect(await repo.getDoctorProfile(scopeA, b.user.id)).toBeNull();
    expect(await repo.updateDoctorProfile(scopeA, b.user.id, { fullName: "Hacked" })).toBeNull();
    expect((await repo.getDoctorProfile({ organizationId: b.organization.id }, b.user.id))?.fullName).toBe("Dr. Beta Owner");
    const listA = await repo.listUsers(scopeA);
    expect(listA.map((u) => u.email).sort()).toEqual(["doctor.a@example.test", "owner.a@example.test"]);
  });

  it("usage metrics are aggregated per organisation", async () => {
    const { repo, a, b } = world;
    await repo.recordUsageEvent({ organizationId: b.organization.id }, { userId: b.user.id, type: "note_generated" });
    const summaryA = await repo.summarizeUsage({ organizationId: a.organization.id }, { since: new Date(0) });
    expect(summaryA.notesGeneratedThisMonth).toBe(0);
    expect(await repo.listRecentUsageEvents({ organizationId: a.organization.id }, { limit: 10 })).toEqual([]);
  });
});

describe("tenant isolation – API layer", () => {
  it("members endpoint lists only the caller's organisation", async () => {
    const res = await members(makeRequest("/api/organization/members", { cookie: await sessionCookieFor(world.a.user) }));
    const body = await res.json();
    expect(body.members.map((m: { email: string }) => m.email)).not.toContain("owner.b@example.test");
    expect(body.members).toHaveLength(2);
  });

  it("doctors (non-admin) cannot list members", async () => {
    const res = await members(makeRequest("/api/organization/members", { cookie: await sessionCookieFor(world.doctorA) }));
    expect(res.status).toBe(403);
  });

  it("a token whose organisation claim does not match the user's organisation is rejected", async () => {
    const forgedUser = { ...world.a.user, organizationId: world.b.organization.id };
    const res = await getProfile(makeRequest("/api/user/profile", { cookie: await sessionCookieFor(forgedUser) }));
    expect(res.status).toBe(401);
  });

  it("profile updates only ever affect the caller (no user id accepted from the client)", async () => {
    const res = await patchProfile(
      makeRequest("/api/user/profile", {
        method: "PATCH",
        json: { fullName: "Nume Nou", userId: world.b.user.id },
        cookie: await sessionCookieFor(world.a.user),
      }),
    );
    expect(res.status).toBe(400); // unknown keys rejected (strict schema)
    const b = await world.repo.getDoctorProfile({ organizationId: world.b.organization.id }, world.b.user.id);
    expect(b?.fullName).toBe("Dr. Beta Owner");
  });

  it("dashboard data for org A contains no data from org B", async () => {
    const cookieB = await sessionCookieFor(world.b.user);
    await events(makeRequest("/api/consultation/events", { json: { type: "consultation_started", patientInformed: true }, cookie: cookieB }));
    const dash = await getDashboardData(
      { userId: world.a.user.id, organizationId: world.a.organization.id, role: "owner", email: world.a.user.email },
      world.repo,
    );
    expect(dash.recentActivity).toEqual([]);
    expect(dash.organization.name).toBe("Clinica Alfa");
  });
});
