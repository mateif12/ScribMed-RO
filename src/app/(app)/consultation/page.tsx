import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsultationWorkspace } from "@/components/consultation/consultation-workspace";
import { getSpecialty, listSpecialties } from "@/config/specialties";
import { getCurrentAuth } from "@/lib/auth/session";
import { getProfile } from "@/services/profile-service";

export const metadata: Metadata = { title: "Consultație" };

export default async function ConsultationPage() {
  const auth = await getCurrentAuth();
  if (!auth) redirect("/login");
  const { profile } = await getProfile(auth);
  const specialty = getSpecialty(profile.specialty);
  return (
    <ConsultationWorkspace
      defaultSpecialty={specialty.enabled ? specialty.id : "medicina_generala"}
      specialties={listSpecialties().map((s) => ({ id: s.id, label: s.label, enabled: s.enabled }))}
    />
  );
}
