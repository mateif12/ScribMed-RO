import { Users } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSpecialty } from "@/config/specialties";
import { getCurrentAuth } from "@/lib/auth/session";
import { listOrganizationMembers } from "@/services/profile-service";
import { ROLE_LABELS } from "@/types/domain";

export const metadata: Metadata = { title: "Echipă" };

export default async function TeamPage() {
  const auth = await getCurrentAuth();
  if (!auth) redirect("/login");
  if (auth.role !== "owner" && auth.role !== "admin") redirect("/dashboard");
  const members = await listOrganizationMembers(auth);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Echipa clinicii</h1>
        <p className="mt-1 text-sm text-muted-foreground">Membrii organizației dumneavoastră și rolurile lor.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-primary" /> {members.length} {members.length === 1 ? "membru" : "membri"}
          </CardTitle>
          <CardDescription>Invitarea de membri noi va fi disponibilă împreună cu planul „Clinică”.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Nume</th>
                  <th className="py-2 pr-4 font-medium">E-mail</th>
                  <th className="py-2 pr-4 font-medium">Specialitate</th>
                  <th className="py-2 font-medium">Rol</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium text-navy">{m.fullName ?? "—"}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{m.email}</td>
                    <td className="py-3 pr-4">{m.specialty ? getSpecialty(m.specialty).label : "—"}</td>
                    <td className="py-3">
                      <Badge variant={m.role === "owner" ? "navy" : "secondary"}>{ROLE_LABELS[m.role]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
