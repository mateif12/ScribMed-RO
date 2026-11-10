import type {
  DoctorProfile,
  Organization,
  Role,
  SpecialtyId,
  Subscription,
  UsageEvent,
  UsageEventType,
  UsageSummary,
  User,
} from "@/types/domain";

/**
 * Tenant scope. Every tenant-scoped repository method REQUIRES it and filters
 * by `organizationId` – it is impossible to query another tenant's rows
 * through these methods.
 */
export interface TenantScope {
  readonly organizationId: string;
}

export interface NewOrganizationInput {
  organization: { name: string; fiscalCode?: string | null; city?: string | null };
  owner: { email: string; externalId?: string | null; passwordHash?: string | null };
  profile: { fullName: string; title?: string | null; specialty: SpecialtyId; stampCode?: string | null };
}

export interface NewUsageEvent {
  userId: string;
  type: UsageEventType;
  audioSeconds?: number | null;
  processingMs?: number | null;
  redactionCount?: number | null;
  specialty?: SpecialtyId | null;
}

export interface ProfilePatch {
  fullName?: string;
  title?: string | null;
  specialty?: SpecialtyId;
  stampCode?: string | null;
}

export interface OrganizationPatch {
  name?: string;
  fiscalCode?: string | null;
  city?: string | null;
}

export interface Repository {
  readonly kind: "memory" | "postgres";

  // ---- Identity lookups used by authentication (pre-tenant) -------------
  findUserByEmail(email: string): Promise<User | null>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  /** Used only to resolve a verified session subject. */
  findUserById(userId: string): Promise<User | null>;
  createOrganizationWithOwner(input: NewOrganizationInput): Promise<{ organization: Organization; user: User }>;
  setUserExternalId(userId: string, externalId: string): Promise<void>;
  setUserPasswordHash(userId: string, passwordHash: string): Promise<void>;

  // ---- Tenant-scoped ----------------------------------------------------
  getOrganization(scope: TenantScope): Promise<Organization | null>;
  updateOrganization(scope: TenantScope, patch: OrganizationPatch): Promise<Organization | null>;
  getUser(scope: TenantScope, userId: string): Promise<User | null>;
  listUsers(scope: TenantScope): Promise<Array<User & { profile: DoctorProfile | null }>>;
  addUser(scope: TenantScope, user: { email: string; role: Role; externalId?: string | null; passwordHash?: string | null }, profile: ProfilePatch & { fullName: string; specialty: SpecialtyId }): Promise<User>;
  getDoctorProfile(scope: TenantScope, userId: string): Promise<DoctorProfile | null>;
  updateDoctorProfile(scope: TenantScope, userId: string, patch: ProfilePatch): Promise<DoctorProfile | null>;
  getSubscription(scope: TenantScope): Promise<Subscription | null>;
  recordUsageEvent(scope: TenantScope, event: NewUsageEvent): Promise<UsageEvent>;
  listRecentUsageEvents(scope: TenantScope, opts: { userId?: string; limit: number }): Promise<UsageEvent[]>;
  summarizeUsage(scope: TenantScope, opts: { userId?: string; since: Date }): Promise<UsageSummary>;
}

export function startOfMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
