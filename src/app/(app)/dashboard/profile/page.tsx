import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { listSpecialties } from "@/config/specialties";
import { getCurrentAuth } from "@/lib/auth/session";
import { getProfile } from "@/services/profile-service";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const auth = await getCurrentAuth();
  if (!auth) redirect("/login");
  const view = await getProfile(auth);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Profil și clinică</h1>
        <p className="mt-1 text-sm text-muted-foreground">{view.user.email}</p>
      </div>
      <ProfileForm
        profile={{ fullName: view.profile.fullName, title: view.profile.title, specialty: view.profile.specialty, stampCode: view.profile.stampCode }}
        organization={{ name: view.organization.name, city: view.organization.city, fiscalCode: view.organization.fiscalCode }}
        canEditOrganization={auth.role === "owner" || auth.role === "admin"}
        specialties={listSpecialties().map((s) => ({ id: s.id, label: s.label, enabled: s.enabled }))}
      />
    </div>
  );
}
