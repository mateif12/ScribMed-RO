"use client";

import { AlertTriangle, Check, ClipboardCopy, FilePlus2, Info, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_DISCLAIMER } from "@/lib/ai/note-format";
import type { GeneratedNoteWarning } from "@/lib/consultation/state-machine";

interface Props {
  note: string;
  edited: boolean;
  warnings: GeneratedNoteWarning[];
  provider: string | null;
  transcript: string | null;
  redactionTotal: number;
  regenerating: boolean;
  onChange: (note: string) => void;
  onCopy: () => Promise<boolean>;
  onRegenerate: () => void;
  onNewConsultation: () => void;
  onDeleteSession: () => void;
}

export function NoteEditor(props: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    const ok = await props.onCopy();
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <div className="space-y-5">
      <Alert variant="warning" data-testid="note-disclaimer">
        <ShieldAlert />
        <AlertTitle>Necesită validare medicală</AlertTitle>
        <AlertDescription>{NOTE_DISCLAIMER}</AlertDescription>
      </Alert>

      {props.warnings.length > 0 ? (
        <Alert variant="destructive" data-testid="note-warnings">
          <AlertTriangle />
          <AlertTitle>Verificați cu atenție</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {props.warnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{w.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Fișa de consultație</CardTitle>
            {props.edited ? <Badge variant="secondary">Editată de medic</Badge> : <Badge>Draft generat</Badge>}
            {props.provider === "mock" ? <Badge variant="outline">Mod demonstrativ</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCopy} data-testid="copy-note">
              {copyState === "copied" ? <Check /> : <ClipboardCopy />}
              {copyState === "copied" ? "Copiat" : copyState === "failed" ? "Copierea a eșuat" : "Copiază în clipboard"}
            </Button>
            <Button variant="outline" onClick={props.onRegenerate} disabled={props.regenerating} data-testid="regenerate-note">
              <RefreshCw className={props.regenerating ? "animate-spin" : undefined} /> Regenerează fișa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <label htmlFor="note-text" className="sr-only">
            Conținutul fișei
          </label>
          <Textarea
            id="note-text"
            value={props.note}
            onChange={(e) => props.onChange(e.target.value)}
            spellCheck
            lang="ro"
            className="min-h-[560px] font-[450] leading-7 text-navy"
            data-testid="note-text"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Textul poate fi editat direct. Fișa nu este salvată pe server – copiați-o în sistemul clinicii înainte de a închide
            sesiunea.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button variant="navy" size="lg" onClick={props.onNewConsultation} data-testid="new-consultation">
          <FilePlus2 /> Consultație nouă
        </Button>
        <Button variant="outline" size="lg" className="text-destructive hover:text-destructive" onClick={props.onDeleteSession} data-testid="delete-session">
          <Trash2 /> Șterge sesiunea
        </Button>
      </div>

      {props.transcript ? (
        <details className="group rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-navy">
            <span className="flex items-center gap-2">
              <Info className="size-4 text-primary" /> Transcriere de-identificată (doar în memorie)
            </span>
            <Badge variant="secondary">{props.redactionTotal} identificatori eliminați</Badge>
          </summary>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 font-sans text-sm leading-6 text-navy" data-testid="redacted-transcript">
            {props.transcript}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
