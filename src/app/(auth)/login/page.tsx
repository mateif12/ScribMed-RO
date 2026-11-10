import { Info } from "lucide-react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getEnv } from "@/config/env";
import { DEMO_ACCOUNT } from "@/lib/database";

export const metadata: Metadata = { title: "Autentificare" };

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const env = getEnv();
  const demoMode = env.AUTH_PROVIDER === "mock" && env.DATABASE_PROVIDER === "memory" && env.NODE_ENV !== "production";
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-navy">Bine ați revenit</h1>
      <p className="mt-2 text-sm text-muted-foreground">Autentificați-vă pentru a continua în ScribMed RO.</p>
      {demoMode ? (
        <Alert variant="info" className="mt-6">
          <Info />
          <AlertDescription>
            <strong>Mod demonstrativ.</strong> Cont de test: <code>{DEMO_ACCOUNT.email}</code> / <code>{DEMO_ACCOUNT.password}</code>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mt-6">
        <LoginForm next={safeNext(params.next)} demo={demoMode ? DEMO_ACCOUNT : null} />
      </div>
    </div>
  );
}
