"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut /> <span className="hidden sm:inline">Deconectare</span>
    </Button>
  );
}
