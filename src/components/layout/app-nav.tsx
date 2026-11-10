"use client";

import { LayoutDashboard, Mic, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AppNav({ canManageTeam }: { canManageTeam: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/dashboard", label: "Panou", icon: LayoutDashboard, exact: true },
    { href: "/consultation", label: "Consultație", icon: Mic },
    { href: "/dashboard/profile", label: "Profil", icon: UserRound },
    ...(canManageTeam ? [{ href: "/dashboard/team", label: "Echipă", icon: Users }] : []),
  ];
  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Navigare aplicație">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-navy",
              active && "bg-muted text-navy",
            )}
          >
            <item.icon className="size-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
