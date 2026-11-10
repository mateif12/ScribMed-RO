import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" fill="#0b1b33" />
      <path d="M7 16h3l2-5 3.2 10 2.6-7 1.6 2H25" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 font-semibold tracking-tight text-navy", className)} aria-label="ScribMed RO – pagina principală">
      <LogoMark />
      <span className="text-[17px]">
        ScribMed <span className="text-primary">RO</span>
      </span>
    </Link>
  );
}
