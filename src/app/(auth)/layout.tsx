import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} ScribMed RO</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-navy lg:flex lg:flex-col lg:justify-end lg:p-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_10%,rgba(16,185,129,0.25),transparent_70%)]" />
        <blockquote className="relative max-w-md text-white">
          <p className="text-2xl font-medium leading-snug">„Tu asculți pacientul. Noi documentăm consultația.”</p>
          <div className="mt-8 flex items-start gap-3 text-sm text-white/70">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
            <p>
              Audio, transcrierile și fișele generate nu sunt stocate. Identificatorii direcți sunt eliminați înaintea
              procesării AI, iar fiecare fișă necesită validarea medicului.
            </p>
          </div>
        </blockquote>
      </aside>
    </div>
  );
}
