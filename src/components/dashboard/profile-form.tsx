"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { FormField } from "@/components/auth/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { apiFetch, ApiClientError } from "@/lib/api/client";

interface Props {
  profile: { fullName: string; title: string | null; specialty: string; stampCode: string | null };
  organization: { name: string; city: string | null; fiscalCode: string | null };
  canEditOrganization: boolean;
  specialties: { id: string; label: string; enabled: boolean }[];
}

export function ProfileForm({ profile, organization, canEditOrganization, specialties }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "").trim();
    const nullable = (k: string) => (str(k) ? str(k) : null);
    try {
      await apiFetch("/api/user/profile", {
        method: "PATCH",
        json: {
          fullName: str("fullName"),
          title: nullable("title"),
          specialty: str("specialty"),
          stampCode: nullable("stampCode"),
          ...(canEditOrganization
            ? { organization: { name: str("orgName"), city: nullable("orgCity"), fiscalCode: nullable("orgFiscalCode") } }
            : {}),
        },
      });
      setStatus({ kind: "success", message: "Modificările au fost salvate." });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiClientError ? err.message : "Salvarea a eșuat." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" action="#" onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Date profesionale</CardTitle>
          <CardDescription>Aceste date nu sunt incluse automat în fișele generate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField id="fullName" label="Nume complet" defaultValue={profile.fullName} required />
          <FormField id="title" label="Titlu profesional" defaultValue={profile.title ?? ""} placeholder="Medic specialist / primar" />
          <div className="space-y-2">
            <Label htmlFor="specialty">Specialitate</Label>
            <NativeSelect id="specialty" name="specialty" defaultValue={profile.specialty}>
              {specialties.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.enabled}>
                  {s.label}
                  {s.enabled ? "" : " (în curând)"}
                </option>
              ))}
            </NativeSelect>
          </div>
          <FormField id="stampCode" label="Cod parafă" defaultValue={profile.stampCode ?? ""} maxLength={20} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clinică</CardTitle>
          <CardDescription>
            {canEditOrganization ? "Doar proprietarul și administratorii pot modifica aceste date." : "Doar proprietarul sau un administrator pot modifica aceste date."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField id="orgName" label="Denumire" defaultValue={organization.name} disabled={!canEditOrganization} required />
          <FormField id="orgCity" label="Localitate" defaultValue={organization.city ?? ""} disabled={!canEditOrganization} />
          <FormField id="orgFiscalCode" label="CUI" defaultValue={organization.fiscalCode ?? ""} disabled={!canEditOrganization} placeholder="RO12345678" />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4 lg:col-span-2">
        {status ? (
          <Alert variant={status.kind === "success" ? "success" : "destructive"}>
            {status.kind === "success" ? <CheckCircle2 /> : <AlertCircle />}
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : null}
        <div>
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Salvează modificările
          </Button>
        </div>
      </div>
    </form>
  );
}
