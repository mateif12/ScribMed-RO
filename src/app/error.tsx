"use client";

import { Button } from "@/components/ui/button";

/** Generic error boundary. Never renders error details (they may contain data). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-navy">A apărut o eroare neașteptată</h1>
      <p className="max-w-md text-sm text-muted-foreground">Vă rugăm să reîncercați. Dacă problema persistă, contactați suportul ScribMed RO.</p>
      <Button onClick={reset}>Reîncearcă</Button>
    </div>
  );
}
