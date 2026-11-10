import { redirect } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { AppNav } from "@/components/layout/app-nav";
import { LogoutButton } from "@/components/layout/logout-button";
import { getCurrentAuth } from "@/lib/auth/session";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCurrentAuth();
  if (!auth) redirect("/login");
  return (
    <div className="min-h-screen bg-muted/50">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-navy" aria-label="Panou ScribMed RO">
            <LogoMark className="size-7" />
            <span className="hidden md:inline">ScribMed <span className="text-primary">RO</span></span>
          </Link>
          <div className="flex-1">
            <AppNav canManageTeam={auth.role === "owner" || auth.role === "admin"} />
          </div>
          <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground lg:inline">{auth.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
