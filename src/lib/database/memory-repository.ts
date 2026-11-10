import { randomUUID } from "node:crypto";
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

/**
 * In-memory repository for local development and tests. Data is lost on
 * restart. Contains no clinical data by design (see Repository contract).
 */
export class MemoryRepository implements Repository {
  readonly kind = "memory" as const;
  private organizations = new Map<string, Organization>();
  private users = new Map<string, User>();
  private profiles = new Map<string, DoctorProfile>();
  private subscriptions = new Map<string, Subscription>();
  private events: UsageEvent[] = [];

  async findUserByEmail(email: string): Promise<User | null> {
    const e = email.trim().toLowerCase();
    return [...this.users.values()].find((u) => u.email === e) ?? null;
  }

  async findUserByExternalId(externalId: string): Promise<User | null> {
    return [...this.users.values()].find((u) => u.externalId === externalId) ?? null;
  }

  async findUserById(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }

  async createOrganizationWithOwner(input: NewOrganizationInput) {
    const email = input.owner.email.trim().toLowerCase();
    if (await this.findUserByEmail(email)) throw new Error("EMAIL_EXISTS");
    const now = new Date();
    const organization: Organization = {
      id: randomUUID(),
      name: input.organization.name,
      fiscalCode: input.organization.fiscalCode ?? null,
      city: input.organization.city ?? null,
      createdAt: now,
    };
    const user: User = {
      id: randomUUID(),
      organizationId: organization.id,
      email,
      role: "owner",
      externalId: input.owner.externalId ?? null,
      passwordHash: input.owner.passwordHash ?? null,
      isActive: true,
      createdAt: now,
    };
    this.organizations.set(organization.id, organization);
    this.users.set(user.id, user);
    this.profiles.set(user.id, {
      userId: user.id,
      organizationId: organization.id,
      fullName: input.profile.fullName,
      title: input.profile.title ?? null,
      specialty: input.profile.specialty,
      stampCode: input.profile.stampCode ?? null,
      updatedAt: now,
    });
    const sub = defaultTrialSubscription(organization.id, now);
    this.subscriptions.set(organization.id, { ...sub, id: randomUUID() });
    return { organization, user };
  }

  async setUserExternalId(userId: string, externalId: string) {
    const u = this.users.get(userId);
    if (u) u.externalId = externalId;
  }

  async setUserPasswordHash(userId: string, passwordHash: string) {
    const u = this.users.get(userId);
    if (u) u.passwordHash = passwordHash;
  }

  async getOrganization(scope: TenantScope) {
    return this.organizations.get(scope.organizationId) ?? null;
  }

  async updateOrganization(scope: TenantScope, patch: OrganizationPatch) {
    const org = this.organizations.get(scope.organizationId);
    if (!org) return null;
    Object.assign(org, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    return org;
  }

  async getUser(scope: TenantScope, userId: string) {
    const u = this.users.get(userId);
    return u && u.organizationId === scope.organizationId ? u : null;
  }

  async listUsers(scope: TenantScope) {
    return [...this.users.values()]
      .filter((u) => u.organizationId === scope.organizationId)
      .map((u) => ({ ...u, profile: this.profiles.get(u.id) ?? null }));
  }

  async addUser(
    scope: TenantScope,
    user: { email: string; role: User["role"]; externalId?: string | null; passwordHash?: string | null },
    profile: ProfilePatch & { fullName: string; specialty: DoctorProfile["specialty"] },
  ) {
    const email = user.email.trim().toLowerCase();
    if (await this.findUserByEmail(email)) throw new Error("EMAIL_EXISTS");
    const now = new Date();
    const u: User = {
      id: randomUUID(),
      organizationId: scope.organizationId,
      email,
      role: user.role,
      externalId: user.externalId ?? null,
      passwordHash: user.passwordHash ?? null,
      isActive: true,
      createdAt: now,
    };
    this.users.set(u.id, u);
    this.profiles.set(u.id, {
      userId: u.id,
      organizationId: scope.organizationId,
      fullName: profile.fullName,
      title: profile.title ?? null,
      specialty: profile.specialty,
      stampCode: profile.stampCode ?? null,
      updatedAt: now,
    });
    return u;
  }

  async getDoctorProfile(scope: TenantScope, userId: string) {
    const p = this.profiles.get(userId);
    return p && p.organizationId === scope.organizationId ? p : null;
  }

  async updateDoctorProfile(scope: TenantScope, userId: string, patch: ProfilePatch) {
    const p = await this.getDoctorProfile(scope, userId);
    if (!p) return null;
    Object.assign(p, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: new Date() });
    return p;
  }

  async getSubscription(scope: TenantScope) {
    return this.subscriptions.get(scope.organizationId) ?? null;
  }

  async recordUsageEvent(scope: TenantScope, event: NewUsageEvent) {
    const e: UsageEvent = {
      id: randomUUID(),
      organizationId: scope.organizationId,
      userId: event.userId,
      type: event.type,
      audioSeconds: event.audioSeconds ?? null,
      processingMs: event.processingMs ?? null,
      redactionCount: event.redactionCount ?? null,
      specialty: event.specialty ?? null,
      createdAt: new Date(),
    };
    this.events.push(e);
    return e;
  }

  async listRecentUsageEvents(scope: TenantScope, opts: { userId?: string; limit: number }) {
    return this.events
      .filter((e) => e.organizationId === scope.organizationId && (!opts.userId || e.userId === opts.userId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, opts.limit);
  }

  async summarizeUsage(scope: TenantScope, opts: { userId?: string; since: Date }): Promise<UsageSummary> {
    return summarize(
      this.events.filter(
        (e) =>
          e.organizationId === scope.organizationId &&
          (!opts.userId || e.userId === opts.userId) &&
          e.createdAt >= opts.since,
      ),
    );
  }
}
