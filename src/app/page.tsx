import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Clock3,
  EyeOff,
  FileText,
  HeartPulse,
  KeyRound,
  Languages,
  Lock,
  Mic,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: UserCheck,
    title: "Informați pacientul",
    text: "Confirmați în aplicație că pacientul a fost informat și și-a exprimat acordul înainte de înregistrare.",
  },
  {
    icon: Mic,
    title: "Purtați consultația natural",
    text: "Înregistrarea are loc local, în browser. Puteți pune pauză sau relua oricând. Nimic nu este transmis în timpul consultației.",
  },
  {
    icon: EyeOff,
    title: "Date personale eliminate",
    text: "După transcriere, identificatorii direcți (CNP, telefon, e-mail, nume, adresă) sunt înlocuiți automat înainte de procesarea AI.",
  },
  {
    icon: FileText,
    title: "Verificați și copiați fișa",
    text: "Primiți o fișă structurată în 6 secțiuni, în terminologie medicală românească. O editați, o validați și o copiați în sistemul dvs.",
  },
];

const benefits = [
  { icon: Clock3, title: "Timp redat pacientului", text: "Mai puțin timp la tastatură, mai mult contact vizual și atenție pentru pacient." },
  { icon: Languages, title: "Română medicală profesională", text: "Terminologie corectă, gramatică îngrijită, fără a schimba sensul medical." },
  { icon: ClipboardCheck, title: "Structură consecventă", text: "Motive, istoric, antecedente, examen obiectiv, diagnostic și plan – mereu în aceeași ordine." },
  { icon: BadgeCheck, title: "Fără informații inventate", text: "Ce nu a fost spus apare ca „Neconsemnat”. Incertitudinile și contradicțiile sunt păstrate." },
  { icon: Stethoscope, title: "Medicul decide", text: "Nu este un sistem de diagnostic. Fiecare fișă este un draft care necesită validarea dvs." },
  { icon: Sparkles, title: "Pregătit pentru specialități", text: "Medicină generală astăzi; stomatologie, dermatologie, psihiatrie și altele în curând." },
];

const securityControls = [
  { icon: Trash2, title: "Fără stocarea conținutului clinic", text: "Audio, transcrierile și fișele nu sunt salvate în baza de date. Sesiunea se golește la o consultație nouă." },
  { icon: EyeOff, title: "Redactarea identificatorilor", text: "Identificatorii direcți sunt eliminați înaintea trimiterii către modelul AI. Datele clinice rămân date sensibile." },
  { icon: Lock, title: "Criptare în tranzit", text: "Comunicare exclusiv prin HTTPS. Cheile API rămân pe server, niciodată în browser." },
  { icon: ServerCog, title: "Procesare în regiuni UE", text: "Furnizori configurați în regiuni din Uniunea Europeană (AWS eu-central-1, Azure Europe)." },
  { icon: KeyRound, title: "Izolare între clinici", text: "Fiecare organizație își vede doar propriile date operaționale. Acces pe roluri." },
  { icon: ShieldCheck, title: "Jurnale fără date clinice", text: "Jurnalele conțin doar metadate operaționale. Fără analytics sau session replay terțe." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Navigare principală">
            <a href="#cum-functioneaza" className="hover:text-navy">Cum funcționează</a>
            <a href="#beneficii" className="hover:text-navy">Beneficii</a>
            <a href="#securitate" className="hover:text-navy">Securitate</a>
            <a href="#preturi" className="hover:text-navy">Prețuri</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Autentificare</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Începe gratuit</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_0%,rgba(16,185,129,0.10),transparent_70%),radial-gradient(40%_40%_at_0%_30%,rgba(11,27,51,0.05),transparent_70%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
            <div>
              <Badge variant="default" className="mb-6">
                <HeartPulse /> Documentare clinică asistată pentru medicii din România
              </Badge>
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-navy sm:text-5xl lg:text-[3.4rem]">
                Tu asculți pacientul.
                <br />
                <span className="text-primary">Noi documentăm consultația.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                ScribMed RO ascultă conversația naturală dintre medic și pacient și redactează o fișă de consultație
                structurată, în limbaj medical românesc profesionist. Dumneavoastră verificați, editați și validați.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">
                    Începe gratuit <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Autentificare</Link>
                </Button>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                Fără card bancar · Perioadă de probă 14 zile · Conținutul clinic nu este stocat
              </p>
            </div>

            {/* Product preview */}
            <div className="relative">
              <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-lift)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="relative flex size-3">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-60" />
                      <span className="relative inline-flex size-3 rounded-full bg-red-500" />
                    </span>
                    <span className="text-sm font-medium text-navy">Înregistrare în curs</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">12:48</span>
                </div>
                <div className="mt-5 flex h-12 items-end gap-1" aria-hidden="true">
                  {[30, 55, 40, 70, 45, 85, 60, 35, 75, 50, 65, 40, 80, 55, 30, 60, 45, 70, 50, 35, 65, 45, 75, 40].map((h, i) => (
                    <span key={i} className="flex-1 rounded-full bg-primary/70" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="mt-5 space-y-3 rounded-xl bg-muted p-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Motivele prezentării</p>
                    <p className="mt-1 text-navy">Odinofagie de 3 zile, febră 38,5°C (relatat).</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">4. Examen clinic obiectiv</p>
                    <p className="mt-1 text-navy">Faringe congestionat, amigdale hipertrofice cu depozite albicioase.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">5. Diagnostic prezumtiv</p>
                    <p className="mt-1 text-navy">Amigdalită acută, posibil bacteriană.</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">Exemplu ilustrativ generat din date sintetice.</p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="cum-functioneaza" className="border-t bg-muted/60 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="Cum funcționează" title="De la conversație la fișă, în patru pași" />
            <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                      <s.icon className="size-5" />
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">Pasul {i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-semibold text-navy">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefits */}
        <section id="beneficii" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="Beneficii" title="Construit pentru realitatea cabinetelor din România" />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((b) => (
                <div key={b.title} className="rounded-2xl border p-6 transition-shadow hover:shadow-[var(--shadow-soft)]">
                  <b.icon className="size-5 text-primary" />
                  <h3 className="mt-4 font-semibold text-navy">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="securitate" className="bg-navy py-20 text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">Securitate și confidențialitate</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Datele pacienților tratate cu seriozitatea cuvenită</h2>
              <p className="mt-4 text-white/70">
                Confidențialitatea este o cerință de bază a produsului, nu o opțiune. Iată ce face aplicația – și ce rămâne
                responsabilitatea operatorului de date.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {securityControls.map((c) => (
                <div key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <c.icon className="size-5 text-emerald-400" />
                  <h3 className="mt-4 font-semibold">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{c.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 max-w-3xl text-sm leading-relaxed text-white/60">
              Important: aceste măsuri tehnice nu fac, prin ele însele, utilizarea conformă GDPR. Conformitatea depinde și de
              temeiul legal, informarea pacienților, acordurile de prelucrare cu furnizorii (DPA), evaluarea de impact (DPIA) și
              procedurile interne ale clinicii.
            </p>
          </div>
        </section>

        {/* Pricing placeholder */}
        <section id="preturi" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="Prețuri" title="Planuri simple, pentru cabinete și clinici" />
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {[
                { name: "Solo", desc: "Pentru medicul care lucrează independent.", features: ["1 medic", "Medicină generală", "Suport prin e-mail"] },
                { name: "Clinică", desc: "Pentru echipe și clinici private.", features: ["Mai mulți medici", "Administrare roluri", "Statistici de utilizare"], highlight: true },
                { name: "Enterprise", desc: "Pentru rețele de clinici.", features: ["Integrare SSO", "Specialități dedicate", "Contract DPA personalizat"] },
              ].map((p) => (
                <div key={p.name} className={`rounded-2xl border p-7 ${p.highlight ? "border-primary shadow-[var(--shadow-lift)]" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-navy">{p.name}</h3>
                    {p.highlight ? <Badge>Recomandat</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
                  <p className="mt-6 text-2xl font-semibold text-navy">În curând</p>
                  <p className="text-xs text-muted-foreground">Prețurile vor fi anunțate la lansare.</p>
                  <ul className="mt-6 space-y-2 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-navy">
                        <BadgeCheck className="size-4 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-7 w-full" variant={p.highlight ? "default" : "outline"}>
                    <Link href="/register">Începe perioada de probă</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
              ScribMed RO este un instrument de suport pentru redactarea documentației medicale. Nu oferă diagnostic și nu ia
              decizii medicale. Medicul curant rămâne responsabil pentru conținutul fiecărui document.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground md:items-end">
            <div className="flex gap-5">
              <a href="#securitate" className="hover:text-navy">Securitate</a>
              <Link href="/login" className="hover:text-navy">Autentificare</Link>
              <Link href="/register" className="hover:text-navy">Cont nou</Link>
            </div>
            <p className="text-xs">© {new Date().getFullYear()} ScribMed RO</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-navy">{title}</h2>
    </div>
  );
}
