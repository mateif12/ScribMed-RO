import {
  Activity,
  ArrowRight,
  Building2,
  Clock3,
  CreditCard,
  FileCheck2,
  Mic,
  ShieldCheck,
  Stethoscope,
  Timer,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSpecialty } from "@/config/specialties";
import { getCurrentAuth } from "@/lib/auth/session";
import { getDashboardData } from "@/services/profile-service";
import { ROLE_LABELS, type UsageEventType } from "@/types/domain";

export const metadata: Metadata = { title: "Panou" };

const EVENT_LABELS: Record<UsageEventType, string> = {
  consultation_started: "Consultație începută",
  transcription_completed: "Transcriere finalizată",
  transcription_failed: "Transcriere eșuată",
  note_generated: "Fișă generată",
  note_generation_failed: "Generare fișă eșuată",
  session_cleared: "Sesiune ștearsă",
};

const PLAN_LABELS = { trial: "Perioadă de probă", solo: "Solo", clinic: "Clinică", enterprise: "Enterprise" } as const;
const STATUS_LABELS = { trialing: "Activ (probă)", active: "Activ", past_due: "Plată restantă", canceled: "Anulat" } as const;

const dateFmt = new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeZone: "Europe/Bucharest" });
const dateTimeFmt = new Intl.DateTimeFormat("ro-RO", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bucharest" });

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Bucharest" }).format(new Date()));
  if (hour < 11) return "Bună dimineața";
  if (hour < 18) return "Bună ziua";
  return "Bună seara";
}

export default async function DashboardPage() {
  const auth = await getCurrentAuth();
  if (!auth) redirect("/login");
  const data = await getDashboardData(auth);
  const { profile, organization, subscription, usage, recentActivity, quota } = data;
  const quotaPct = quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0;

  const stats = [
    { label: "Consultații luna aceasta", value: usage.consultationsThisMonth, icon: Stethoscope },
    { label: "Fișe generate", value: usage.notesGeneratedThisMonth, icon: FileCheck2 },
    { label: "Minute audio procesate", value: usage.audioMinutesThisMonth.toLocaleString("ro-RO"), icon: Clock3 },
    {
      label: "Timp mediu de procesare",
      value: usage.averageProcessingSeconds === null ? "—" : `${usage.averageProcessingSeconds.toLocaleString("ro-RO")} s`,
      icon: Timer,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome + CTA */}
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="relative overflow-hidden border-0 bg-navy text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_70%_at_90%_10%,rgba(16,185,129,0.28),transparent_70%)]" />
          <CardContent className="relative flex h-full flex-col justify-between gap-8 p-8">
            <div>
              <p className="text-sm text-white/60">{greeting()},</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{profile.fullName}</h1>
              <p className="mt-3 max-w-lg text-white/70">
                Pregătit pentru următoarea consultație? Informați pacientul, porniți înregistrarea și concentrați-vă pe
                conversație.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="shadow-lg shadow-emerald-900/30">
                <Link href="/consultation">
                  <Mic /> Începe Consultația
                </Link>
              </Button>
              <span className="flex items-center gap-2 text-xs text-white/60">
                <ShieldCheck className="size-4 text-emerald-400" /> Conținutul clinic nu este stocat
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" /> Abonament
              </CardTitle>
              {subscription ? <Badge variant={subscription.status === "past_due" || subscription.status === "canceled" ? "destructive" : "default"}>{STATUS_LABELS[subscription.status]}</Badge> : null}
            </div>
            <CardDescription>
              {subscription ? `${PLAN_LABELS[subscription.plan]} · până la ${dateFmt.format(subscription.currentPeriodEnd)}` : "Fără abonament activ"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Fișe generate în clinică (luna curentă)</span>
                <span className="font-medium text-navy">
                  {quota.used}
                  {quota.limit ? ` / ${quota.limit}` : ""}
                </span>
              </div>
              {quota.limit ? <Progress value={quotaPct} aria-label="Utilizare abonament" /> : <p className="text-xs text-muted-foreground">Nelimitat</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Facturarea online (Stripe) va fi disponibilă în curând. Pentru schimbarea planului, contactați echipa ScribMed RO.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Stats */}
      <section aria-label="Statistici de utilizare" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-navy">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {/* Doctor profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="size-4 text-primary" /> Profil medic
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Nume">{profile.fullName}</Row>
              <Row label="Titlu">{profile.title ?? "—"}</Row>
              <Row label="Specialitate">{getSpecialty(profile.specialty).label}</Row>
              <Row label="Cod parafă">{profile.stampCode ?? "—"}</Row>
              <Row label="Rol">{ROLE_LABELS[auth.role]}</Row>
            </dl>
            <Button asChild variant="outline" size="sm" className="mt-5">
              <Link href="/dashboard/profile">
                Editează profilul <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Clinic */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" /> Clinică
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Denumire">{organization.name}</Row>
              <Row label="Localitate">{organization.city ?? "—"}</Row>
              <Row label="CUI">{organization.fiscalCode ?? "—"}</Row>
              <Row label="Client din">{dateFmt.format(organization.createdAt)}</Row>
            </dl>
          </CardContent>
        </Card>

        {/* Recent activity – operational metadata only */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-primary" /> Activitate recentă
            </CardTitle>
            <CardDescription>Doar metadate operaționale – fără conținut clinic.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio activitate încă. Începeți prima consultație.</p>
            ) : (
              <ul className="space-y-3" data-testid="recent-activity">
                {recentActivity.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium text-navy">{EVENT_LABELS[e.type]}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          e.audioSeconds !== null ? `${Math.round(e.audioSeconds / 60)} min audio` : null,
                          e.processingMs !== null ? `${(e.processingMs / 1000).toFixed(1)} s procesare` : null,
                          e.redactionCount !== null ? `${e.redactionCount} identificatori eliminați` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.createdAt.toISOString()}>
                      {dateTimeFmt.format(e.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-navy">{children}</dd>
    </div>
  );
}
