/**
 * Runs the repository contract against a real PostgreSQL database.
 * Skipped unless TEST_DATABASE_URL is set, e.g.
 *   TEST_DATABASE_URL=postgres://scribmed:scribmed@localhost:5432/scribmed_test npm test
 * WARNING: the tables in that database are truncated.
 */
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresRepository } from "@/lib/database/postgres-repository";
import { migrate } from "../../scripts/migrate";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PostgresRepository (real database)", () => {
  let pool: Pool;
  let repo: PostgresRepository;

  beforeAll(async () => {
    await migrate(url!);
    pool = new Pool({ connectionString: url });
    repo = new PostgresRepository(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE usage_events, doctor_profiles, subscriptions, users, organizations CASCADE");
  });
  afterAll(async () => {
    await pool?.end();
  });

  const create = (n: string) =>
    repo.createOrganizationWithOwner({
      organization: { name: `Clinica ${n}`, city: "Cluj" },
      owner: { email: `${n}@example.test`, passwordHash: "x" },
      profile: { fullName: `Dr. ${n}`, specialty: "medicina_generala" },
    });

  it("creates organisation, owner, profile and trial subscription atomically", async () => {
    const { organization, user } = await create("alfa");
    const scope = { organizationId: organization.id };
    expect(user.role).toBe("owner");
    expect((await repo.getDoctorProfile(scope, user.id))?.fullName).toBe("Dr. alfa");
    expect((await repo.getSubscription(scope))?.plan).toBe("trial");
    await expect(create("alfa")).rejects.toThrow("EMAIL_EXISTS");
    const orgs = await pool.query("SELECT count(*)::int AS n FROM organizations");
    expect(orgs.rows[0].n).toBe(1); // failed duplicate rolled back its organisation row
  });

  it("enforces tenant isolation in every scoped query", async () => {
    const a = await create("a");
    const b = await create("b");
    const scopeA = { organizationId: a.organization.id };
    expect(await repo.getUser(scopeA, b.user.id)).toBeNull();
    expect(await repo.getDoctorProfile(scopeA, b.user.id)).toBeNull();
    expect(await repo.updateDoctorProfile(scopeA, b.user.id, { fullName: "X" })).toBeNull();
    expect((await repo.listUsers(scopeA)).map((u) => u.id)).toEqual([a.user.id]);
    await repo.recordUsageEvent({ organizationId: b.organization.id }, { userId: b.user.id, type: "note_generated" });
    expect(await repo.listRecentUsageEvents(scopeA, { limit: 10 })).toEqual([]);
  });

  it("rejects cross-tenant foreign keys at the database level", async () => {
    const a = await create("a");
    const b = await create("b");
    await expect(
      repo.recordUsageEvent({ organizationId: a.organization.id }, { userId: b.user.id, type: "note_generated" }),
    ).rejects.toThrow();
  });

  it("updates profile and organisation fields, including explicit nulls", async () => {
    const { organization, user } = await create("c");
    const scope = { organizationId: organization.id };
    await repo.updateDoctorProfile(scope, user.id, { title: "Medic primar", stampCode: "A1" });
    const p = await repo.updateDoctorProfile(scope, user.id, { stampCode: null });
    expect(p).toMatchObject({ title: "Medic primar", stampCode: null });
    const o = await repo.updateOrganization(scope, { name: "Nou", city: null });
    expect(o).toMatchObject({ name: "Nou", city: null });
  });

  it("summarises usage per organisation and user", async () => {
    const { organization, user } = await create("d");
    const scope = { organizationId: organization.id };
    await repo.recordUsageEvent(scope, { userId: user.id, type: "consultation_started" });
    await repo.recordUsageEvent(scope, { userId: user.id, type: "transcription_completed", audioSeconds: 600, processingMs: 2000 });
    await repo.recordUsageEvent(scope, { userId: user.id, type: "note_generated", processingMs: 4000 });
    const s = await repo.summarizeUsage(scope, { since: new Date(Date.now() - 60_000) });
    expect(s).toEqual({ consultationsThisMonth: 1, notesGeneratedThisMonth: 1, audioMinutesThisMonth: 10, averageProcessingSeconds: 3 });
  });

  it("the schema has no columns that could hold clinical free text", async () => {
    const res = await pool.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name ~* '(transcript|note|audio_data|diagnos|cnp|patient)'",
    );
    expect(res.rows).toEqual([]);
  });
});
