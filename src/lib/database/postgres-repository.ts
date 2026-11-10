import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { DoctorProfile, Organization, Subscription, UsageEvent, UsageSummary, User } from "@/types/domain";
import type {
  NewOrganizationInput,
  NewUsageEvent,
  OrganizationPatch,
  ProfilePatch,
  Repository,
  TenantScope,
} from "./repository";
import { defaultTrialSubscription, summarize } from "./shared";

type Row = QueryResultRow;

const mapOrg = (r: Row): Organization => ({
  id: r.id,
  name: r.name,
  fiscalCode: r.fiscal_code,
  city: r.city,
  createdAt: new Date(r.created_at),
});
const mapUser = (r: Row): User => ({
  id: r.id,
  organizationId: r.organization_id,
  email: r.email,
  role: r.role,
  externalId: r.external_id,
  passwordHash: r.password_hash,
  isActive: r.is_active,
  createdAt: new Date(r.created_at),
});
const mapProfile = (r: Row): DoctorProfile => ({
  userId: r.user_id,
  organizationId: r.organization_id,
  fullName: r.full_name,
  title: r.title,
  specialty: r.specialty,
  stampCode: r.stamp_code,
  updatedAt: new Date(r.updated_at),
});
const mapSub = (r: Row): Subscription => ({
  id: r.id,
  organizationId: r.organization_id,
  plan: r.plan,
  status: r.status,
  monthlyConsultationLimit: r.monthly_consultation_limit,
  seats: r.seats,
  currentPeriodStart: new Date(r.current_period_start),
  currentPeriodEnd: new Date(r.current_period_end),
  externalCustomerId: r.external_customer_id,
  externalSubscriptionId: r.external_subscription_id,
});
const mapEvent = (r: Row): UsageEvent => ({
  id: r.id,
  organizationId: r.organization_id,
  userId: r.user_id,
  type: r.type,
  audioSeconds: r.audio_seconds,
  processingMs: r.processing_ms,
  redactionCount: r.redaction_count,
  specialty: r.specialty,
  createdAt: new Date(r.created_at),
});

/**
 * PostgreSQL repository. Every tenant-scoped query has an explicit
 * `organization_id = $1` predicate. All queries are parameterised.
 */
export class PostgresRepository implements Repository {
  readonly kind = "postgres" as const;
  constructor(private readonly pool: Pool) {}

  static fromUrl(url: string, ssl: boolean): PostgresRepository {
    return new PostgresRepository(
      new Pool({
        connectionString: url,
        ssl: ssl ? { rejectUnauthorized: true } : undefined,
        max: 10,
        idleTimeoutMillis: 30_000,
        // Never log query parameters (pg does not by default).
      }),
    );
  }

  private async one<T>(sql: string, params: unknown[], map: (r: Row) => T): Promise<T | null> {
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? map(res.rows[0]) : null;
  }

  findUserByEmail(email: string) {
    return this.one("SELECT * FROM users WHERE lower(email) = lower($1)", [email.trim()], mapUser);
  }
  findUserByExternalId(externalId: string) {
    return this.one("SELECT * FROM users WHERE external_id = $1", [externalId], mapUser);
  }
  findUserById(userId: string) {
    return this.one("SELECT * FROM users WHERE id = $1", [userId], mapUser);
  }

  async createOrganizationWithOwner(input: NewOrganizationInput) {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const org = await client.query(
        "INSERT INTO organizations (name, fiscal_code, city) VALUES ($1, $2, $3) RETURNING *",
        [input.organization.name, input.organization.fiscalCode ?? null, input.organization.city ?? null],
      );
      const organization = mapOrg(org.rows[0]);
      let userRes;
      try {
        userRes = await client.query(
          `INSERT INTO users (organization_id, email, role, external_id, password_hash)
           VALUES ($1, lower($2), 'owner', $3, $4) RETURNING *`,
          [organization.id, input.owner.email.trim(), input.owner.externalId ?? null, input.owner.passwordHash ?? null],
        );
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new Error("EMAIL_EXISTS");
        throw e;
      }
      const user = mapUser(userRes.rows[0]);
      await client.query(
        `INSERT INTO doctor_profiles (user_id, organization_id, full_name, title, specialty, stamp_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, organization.id, input.profile.fullName, input.profile.title ?? null, input.profile.specialty, input.profile.stampCode ?? null],
      );
      const s = defaultTrialSubscription(organization.id);
      await client.query(
        `INSERT INTO subscriptions (organization_id, plan, status, monthly_consultation_limit, seats, current_period_start, current_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [organization.id, s.plan, s.status, s.monthlyConsultationLimit, s.seats, s.currentPeriodStart, s.currentPeriodEnd],
      );
      await client.query("COMMIT");
      return { organization, user };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async setUserExternalId(userId: string, externalId: string) {
    await this.pool.query("UPDATE users SET external_id = $2 WHERE id = $1", [userId, externalId]);
  }
  async setUserPasswordHash(userId: string, passwordHash: string) {
    await this.pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);
  }

  getOrganization(scope: TenantScope) {
    return this.one("SELECT * FROM organizations WHERE id = $1", [scope.organizationId], mapOrg);
  }

  updateOrganization(scope: TenantScope, patch: OrganizationPatch) {
    return this.one(
      `UPDATE organizations SET
         name = COALESCE($2, name),
         fiscal_code = CASE WHEN $5 THEN $3 ELSE fiscal_code END,
         city = CASE WHEN $6 THEN $4 ELSE city END
       WHERE id = $1 RETURNING *`,
      [scope.organizationId, patch.name ?? null, patch.fiscalCode ?? null, patch.city ?? null, patch.fiscalCode !== undefined, patch.city !== undefined],
      mapOrg,
    );
  }

  getUser(scope: TenantScope, userId: string) {
    return this.one("SELECT * FROM users WHERE organization_id = $1 AND id = $2", [scope.organizationId, userId], mapUser);
  }

  async listUsers(scope: TenantScope) {
    const res = await this.pool.query(
      `SELECT u.*, p.user_id AS p_user_id, p.organization_id AS p_org, p.full_name, p.title, p.specialty, p.stamp_code, p.updated_at
         FROM users u LEFT JOIN doctor_profiles p ON p.user_id = u.id AND p.organization_id = u.organization_id
        WHERE u.organization_id = $1 ORDER BY u.created_at`,
      [scope.organizationId],
    );
    return res.rows.map((r) => ({
      ...mapUser(r),
      profile: r.p_user_id ? mapProfile({ ...r, user_id: r.p_user_id, organization_id: r.p_org }) : null,
    }));
  }

  async addUser(
    scope: TenantScope,
    user: { email: string; role: User["role"]; externalId?: string | null; passwordHash?: string | null },
    profile: ProfilePatch & { fullName: string; specialty: DoctorProfile["specialty"] },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO users (organization_id, email, role, external_id, password_hash) VALUES ($1, lower($2), $3, $4, $5) RETURNING *`,
        [scope.organizationId, user.email.trim(), user.role, user.externalId ?? null, user.passwordHash ?? null],
      );
      const u = mapUser(res.rows[0]);
      await client.query(
        `INSERT INTO doctor_profiles (user_id, organization_id, full_name, title, specialty, stamp_code) VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.id, scope.organizationId, profile.fullName, profile.title ?? null, profile.specialty, profile.stampCode ?? null],
      );
      await client.query("COMMIT");
      return u;
    } catch (e) {
      await client.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505") throw new Error("EMAIL_EXISTS");
      throw e;
    } finally {
      client.release();
    }
  }

  getDoctorProfile(scope: TenantScope, userId: string) {
    return this.one(
      "SELECT * FROM doctor_profiles WHERE organization_id = $1 AND user_id = $2",
      [scope.organizationId, userId],
      mapProfile,
    );
  }

  updateDoctorProfile(scope: TenantScope, userId: string, patch: ProfilePatch) {
    return this.one(
      `UPDATE doctor_profiles SET
         full_name = COALESCE($3, full_name),
         title = CASE WHEN $7 THEN $4 ELSE title END,
         specialty = COALESCE($5, specialty),
         stamp_code = CASE WHEN $8 THEN $6 ELSE stamp_code END,
         updated_at = now()
       WHERE organization_id = $1 AND user_id = $2 RETURNING *`,
      [
        scope.organizationId,
        userId,
        patch.fullName ?? null,
        patch.title ?? null,
        patch.specialty ?? null,
        patch.stampCode ?? null,
        patch.title !== undefined,
        patch.stampCode !== undefined,
      ],
      mapProfile,
    );
  }

  getSubscription(scope: TenantScope) {
    return this.one("SELECT * FROM subscriptions WHERE organization_id = $1", [scope.organizationId], mapSub);
  }

  async recordUsageEvent(scope: TenantScope, event: NewUsageEvent) {
    const res = await this.pool.query(
      `INSERT INTO usage_events (organization_id, user_id, type, audio_seconds, processing_ms, redaction_count, specialty)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        scope.organizationId,
        event.userId,
        event.type,
        event.audioSeconds ?? null,
        event.processingMs ?? null,
        event.redactionCount ?? null,
        event.specialty ?? null,
      ],
    );
    return mapEvent(res.rows[0]);
  }

  async listRecentUsageEvents(scope: TenantScope, opts: { userId?: string; limit: number }) {
    const res = await this.pool.query(
      `SELECT * FROM usage_events WHERE organization_id = $1 AND ($2::uuid IS NULL OR user_id = $2)
        ORDER BY created_at DESC LIMIT $3`,
      [scope.organizationId, opts.userId ?? null, Math.min(Math.max(opts.limit, 1), 100)],
    );
    return res.rows.map(mapEvent);
  }

  async summarizeUsage(scope: TenantScope, opts: { userId?: string; since: Date }): Promise<UsageSummary> {
    const res = await this.pool.query(
      `SELECT * FROM usage_events WHERE organization_id = $1 AND ($2::uuid IS NULL OR user_id = $2) AND created_at >= $3`,
      [scope.organizationId, opts.userId ?? null, opts.since],
    );
    return summarize(res.rows.map(mapEvent));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
