"use client";

import { AlertCircle, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { FormField } from "./form-field";

export interface SpecialtyOption {
  id: string;
  label: string;
  enabled: boolean;
}

export function RegisterForm({ specialties, passwordHint }: { specialties: SpecialtyOption[]; passwordHint: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    try {
      const res = await apiFetch<{ needsConfirmation: boolean }>("/api/auth/register", {
        json: {
          fullName: fd.get("fullName"),
          email,
          password: fd.get("password"),
          clinicName: fd.get("clinicName"),
          city: fd.get("city") ?? "",
          specialty: fd.get("specialty"),
          acceptTerms: accepted,
        },
      });
      if (res.needsConfirmation) {
        setConfirmEmail(email);
        setPending(false);
      } else {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Înregistrarea a eșuat.");
      setPending(false);
    }
  }

  async function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/confirm", { json: { email: confirmEmail, code: fd.get("code") } });
      router.replace("/login?confirmed=1");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Confirmarea a eșuat.");
      setPending(false);
    }
  }

  if (confirmEmail) {
    return (
      <form onSubmit={onConfirm} className="space-y-5">
        <Alert variant="success">
          <MailCheck />
          <AlertDescription>Am trimis un cod de confirmare la {confirmEmail}. Introduceți-l mai jos.</AlertDescription>
        </Alert>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField id="code" label="Cod de confirmare" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required />
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Confirmă contul
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField id="fullName" label="Nume complet" autoComplete="name" placeholder="Dr. Ana Ionescu" required />
      <FormField id="email" label="E-mail profesional" type="email" autoComplete="email" required />
      <FormField id="password" label="Parolă" type="password" autoComplete="new-password" hint={passwordHint} required />
      <FormField id="clinicName" label="Clinică / cabinet" autoComplete="organization" required />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id="city" label="Localitate" autoComplete="address-level2" />
        <div className="space-y-2">
          <Label htmlFor="specialty">Specialitate</Label>
          <NativeSelect id="specialty" name="specialty" defaultValue="medicina_generala">
            {specialties.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.enabled}>
                {s.label}
                {s.enabled ? "" : " (în curând)"}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex items-start gap-3 pt-1">
        <Checkbox id="acceptTerms" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
        <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug text-muted-foreground">
          Înțeleg că fișele generate sunt documente de suport care necesită verificarea și validarea mea și accept termenii
          de utilizare.
        </Label>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending || !accepted}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Creează contul
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Aveți deja cont?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Autentificare
        </Link>
      </p>
    </form>
  );
}
