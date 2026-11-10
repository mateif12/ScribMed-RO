import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { PASSWORD_POLICY_DESCRIPTION } from "@/lib/auth/password";

export const metadata: Metadata = { title: "Resetare parolă" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-navy">Resetare parolă</h1>
      <p className="mt-2 text-sm text-muted-foreground">Introduceți adresa de e-mail asociată contului.</p>
      <div className="mt-6">
        <ForgotPasswordForm passwordHint={PASSWORD_POLICY_DESCRIPTION} />
      </div>
    </div>
  );
}
