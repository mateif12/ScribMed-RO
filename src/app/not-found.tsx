import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy">Pagina nu a fost găsită</h1>
      </div>
      <Button asChild>
        <Link href="/">Înapoi la pagina principală</Link>
      </Button>
    </div>
  );
}
