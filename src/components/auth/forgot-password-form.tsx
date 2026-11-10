"use client";

import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { FormField } from "./form-field";

export function ForgotPasswordForm({ passwordHint }: { passwordHint: string }) {
  const [step, setStep] = useState<"request" | "reset" | "done">("request");
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const value = String(new FormData(e.currentTarget).get("email") ?? "");
    try {
      const res = await apiFetch<{ devCode?: string }>("/api/auth/forgot-password", { json: { email: value } });
      setEmail(value);
      setDevCode(res.devCode ?? null);
      setStep("reset");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Cererea a eșuat.");
    } finally {
      setPending(false);
    }
  }

  async function reset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/reset-password", { json: { email, code: fd.get("code"), newPassword: fd.get("newPassword") } });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Resetarea a eșuat.");
    } finally {
      setPending(false);
    }
  }

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (step === "done") {
    return (
      <div className="space-y-5">
        <Alert variant="success">
          <CheckCircle2 />
          <AlertDescription>Parola a fost schimbată. Vă puteți autentifica.</AlertDescription>
        </Alert>
        <Button asChild className="w-full" size="lg">
          <Link href="/login">Autentificare</Link>
        </Button>
      </div>
    );
  }

  if (step === "reset") {
    return (
      <form onSubmit={reset} className="space-y-5">
        <Alert variant="info">
          <Info />
          <AlertDescription>
            Dacă există un cont pentru {email}, veți primi un cod de resetare.
            {devCode ? (
              <>
                {" "}
                <strong>Mod demonstrativ:</strong> codul este <code data-testid="dev-reset-code">{devCode}</code>.
              </>
            ) : null}
          </AlertDescription>
        </Alert>
        {errorAlert}
        <FormField id="code" label="Cod de resetare" inputMode="numeric" maxLength={6} autoComplete="one-time-code" required />
        <FormField id="newPassword" label="Parolă nouă" type="password" autoComplete="new-password" hint={passwordHint} required />
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Setează parola nouă
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-5">
      {errorAlert}
      <FormField id="email" label="E-mail" type="email" autoComplete="email" required />
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Trimite codul de resetare
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Înapoi la autentificare
        </Link>
      </p>
    </form>
  );
}
