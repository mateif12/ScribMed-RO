"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { FormField } from "./form-field";

export function LoginForm({ next, demo }: { next: string; demo?: { email: string; password: string } | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/login", { json: { email: fd.get("email"), password: fd.get("password") } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Autentificarea a eșuat.");
      setPending(false);
    }
  }

  return (
    <form method="post" action="#" onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField id="email" label="E-mail" type="email" autoComplete="email" required defaultValue={demo?.email} />
      <div className="space-y-2">
        <FormField id="password" label="Parolă" type="password" autoComplete="current-password" required defaultValue={demo?.password} />
        <div className="text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            Ați uitat parola?
          </Link>
        </div>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={!hydrated || pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Autentificare
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Nu aveți cont?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Începe gratuit
        </Link>
      </p>
    </form>
  );
}
