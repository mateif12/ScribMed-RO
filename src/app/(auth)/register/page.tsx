import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
import { listSpecialties } from "@/config/specialties";
import { PASSWORD_POLICY_DESCRIPTION } from "@/lib/auth/password";

export const metadata: Metadata = { title: "Cont nou" };

export default function RegisterPage() {
  const specialties = listSpecialties().map((s) => ({ id: s.id, label: s.label, enabled: s.enabled }));
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-navy">Creați contul clinicii</h1>
      <p className="mt-2 text-sm text-muted-foreground">Perioadă de probă de 14 zile. Fără card bancar.</p>
      <div className="mt-6">
        <RegisterForm specialties={specialties} passwordHint={PASSWORD_POLICY_DESCRIPTION} />
      </div>
    </div>
  );
}
