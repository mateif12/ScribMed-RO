import "server-only";
import { AppError } from "@/lib/api/errors";
import { getRepository } from "@/lib/database";
import { startOfMonth, type Repository } from "@/lib/database/repository";
import type { ProfilePatchInput } from "@/lib/validation/schemas";
import type { AuthContext, DoctorProfile, Organization, Subscription, UsageEvent, UsageSummary } from "@/types/domain";

export interface ProfileView {
  user: { id: string; email: string; role: AuthContext["role"] };
  profile: DoctorProfile;
  organization: Organization;
  subscription: Subscription | null;
}

export async function getProfile(auth: AuthContext, repo?: Repository): Promise<ProfileView> {
  const r = repo ?? (await getRepository());
  const scope = { organizationId: auth.organizationId };
  const [profile, organization, subscription] = await Promise.all([
    r.getDoctorProfile(scope, auth.userId),
    r.getOrganization(scope),
    r.getSubscription(scope),
  ]);
  if (!profile || !organization) throw new AppError("NOT_FOUND", "Profilul nu a fost găsit.");
  return { user: { id: auth.userId, email: auth.email, role: auth.role }, profile, organization, subscription };
}

export async function updateProfile(auth: AuthContext, patch: ProfilePatchInput, repo?: Repository): Promise<ProfileView> {
  const r = repo ?? (await getRepository());
  const scope = { organizationId: auth.organizationId };
  const { organization, ...profilePatch } = patch;
  if (organization) {
    // Only owners/admins may change organisation data.
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new AppError("FORBIDDEN", "Doar proprietarul sau administratorul pot modifica datele clinicii.");
    }
    await r.updateOrganization(scope, organization);
  }
  if (Object.keys(profilePatch).length > 0) {
    const updated = await r.updateDoctorProfile(scope, auth.userId, profilePatch);
    if (!updated) throw new AppError("NOT_FOUND", "Profilul nu a fost găsit.");
  }
  return getProfile(auth, r);
}

export interface DashboardData extends ProfileView {
  usage: UsageSummary;
  recentActivity: UsageEvent[];
  quota: { used: number; limit: number | null };
}

export async function getDashboardData(auth: AuthContext, repo?: Repository): Promise<DashboardData> {
  const r = repo ?? (await getRepository());
  const scope = { organizationId: auth.organizationId };
  const since = startOfMonth();
  const [view, usage, orgUsage, recentActivity] = await Promise.all([
    getProfile(auth, r),
    r.summarizeUsage(scope, { userId: auth.userId, since }),
    r.summarizeUsage(scope, { since }),
    r.listRecentUsageEvents(scope, { userId: auth.userId, limit: 8 }),
  ]);
  return {
    ...view,
    usage,
    recentActivity,
    quota: { used: orgUsage.notesGeneratedThisMonth, limit: view.subscription?.monthlyConsultationLimit ?? null },
  };
}

export async function listOrganizationMembers(auth: AuthContext, repo?: Repository) {
  const r = repo ?? (await getRepository());
  const users = await r.listUsers({ organizationId: auth.organizationId });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    fullName: u.profile?.fullName ?? null,
    specialty: u.profile?.specialty ?? null,
  }));
}
