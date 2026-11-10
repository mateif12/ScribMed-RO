import { EyeOff, HardDriveDownload, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const items = [
  { icon: HardDriveDownload, text: "Înregistrarea rămâne în memoria browserului și se trimite o singură dată, la final." },
  { icon: Lock, text: "Transmisie criptată (HTTPS); procesare în memorie, fără stocarea audio." },
  { icon: EyeOff, text: "CNP, telefon, e-mail, CI, nume și adrese detectate sunt eliminate înainte de procesarea AI." },
  { icon: Trash2, text: "Transcrierea și fișa nu sunt salvate. Se șterg la „Consultație nouă” sau „Șterge sesiunea”." },
];

export function PrivacyPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" /> Confidențialitate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.text} className="flex gap-3 text-sm text-muted-foreground">
              <it.icon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          Redactarea automată nu garantează anonimizarea completă. Informațiile clinice rămân date sensibile și trebuie tratate ca
          atare.
        </p>
      </CardContent>
    </Card>
  );
}
