"use client";

import {
  AlertCircle,
  CircleStop,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { RecorderError, useAudioRecorder, type RecordedAudio } from "@/hooks/use-audio-recorder";
import { ApiClientError, apiFetch, uploadForTranscription } from "@/lib/api/client";
import { copyTextToClipboard } from "@/lib/consultation/clipboard";
import { MAX_RECORDING_SECONDS, RECORDER_ERROR_MESSAGES } from "@/lib/consultation/media";
import {
  BUSY_STATUSES,
  CAPTURE_STATUSES,
  STATUS_LABELS,
  consultationReducer,
  initialConsultationState,
  type GeneratedNoteWarning,
} from "@/lib/consultation/state-machine";
import { cn, formatDuration } from "@/lib/utils";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { MicLevel } from "./mic-level";
import { NoteEditor } from "./note-editor";
import { PrivacyPanel } from "./privacy-panel";
import { ProcessingSteps } from "./processing-steps";

interface Props {
  defaultSpecialty: string;
  specialties: { id: string; label: string; enabled: boolean }[];
}

interface NoteResponse {
  note: string;
  warnings: GeneratedNoteWarning[];
  provider: string;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError || err instanceof RecorderError) return err.message;
  return fallback;
}

/**
 * Consultation workspace. ALL clinical data (audio blob, transcript, note)
 * lives in React state / refs only. Nothing is written to browser storage.
 */
export function ConsultationWorkspace({ defaultSpecialty, specialties }: Props) {
  const [state, dispatch] = useReducer(consultationReducer, initialConsultationState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [patientInformed, setPatientInformed] = useState(false);
  const [specialty, setSpecialty] = useState(defaultSpecialty);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  /** Audio kept only until transcription succeeds (for retry after a failed upload). */
  const pendingAudioRef = useRef<RecordedAudio | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finishingRef = useRef(false);

  const recorder = useAudioRecorder({
    onInterrupted: (message) => {
      const salvaged = recorder.salvage();
      pendingAudioRef.current = salvaged && salvaged.blob.size > 0 ? salvaged : null;
      dispatch({
        type: "RECORDING_INTERRUPTED",
        message: pendingAudioRef.current
          ? `${message} Puteți procesa partea deja înregistrată sau începe din nou.`
          : message,
      });
    },
    onMaxDuration: () => void finishAndGenerate(),
  });

  const { status } = state;
  const isCapturing = CAPTURE_STATUSES.includes(status);
  const isBusy = BUSY_STATUSES.includes(status);

  // Warn before leaving the page while clinical data exists in memory.
  useEffect(() => {
    const hasData = isCapturing || isBusy || status === "completed";
    if (!hasData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isCapturing, isBusy, status]);

  // Abort in-flight requests when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = useCallback(
    async (transcript: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await apiFetch<NoteResponse>("/api/generate-note", {
          json: { transcript, specialty },
          signal: controller.signal,
        });
        dispatch({ type: "NOTE_READY", note: res.note, warnings: res.warnings, provider: res.provider });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        dispatch({ type: "FAIL", message: errorMessage(err, "Generarea fișei a eșuat."), retry: "generate" });
      }
    },
    [specialty],
  );

  const transcribe = useCallback(
    async (audio: RecordedAudio) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const result = await uploadForTranscription(audio.blob, {
          durationSeconds: audio.durationSeconds,
          signal: controller.signal,
          onUploadProgress: (p) => dispatch({ type: "UPLOAD_PROGRESS", progress: p }),
          onStage: (stage) => {
            if (stage === "received" || stage === "transcribing") dispatch({ type: "UPLOAD_COMPLETE" });
            if (stage === "redacting") dispatch({ type: "REDACTION_STARTED" });
          },
        });
        // Transcription succeeded – drop the only reference to the audio.
        pendingAudioRef.current = null;
        dispatch({ type: "TRANSCRIPT_READY", transcript: result.transcript, redactionTotal: result.redactionTotal });
        await generate(result.transcript);
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "ABORTED") return;
        dispatch({ type: "FAIL", message: errorMessage(err, "Transcrierea a eșuat."), retry: "transcribe" });
      }
    },
    [generate],
  );

  async function startRecording() {
    if (!patientInformed) return;
    dispatch({ type: "START_REQUESTED" });
    try {
      await recorder.start();
      dispatch({ type: "PERMISSION_GRANTED" });
      void apiFetch("/api/consultation/events", { json: { type: "consultation_started", patientInformed: true } }).catch(() => undefined);
    } catch (err) {
      dispatch({ type: "PERMISSION_DENIED", message: errorMessage(err, RECORDER_ERROR_MESSAGES.unknown) });
    }
  }

  async function finishAndGenerate() {
    const current = stateRef.current.status;
    if (finishingRef.current || (current !== "recording" && current !== "paused")) return;
    finishingRef.current = true;
    try {
      dispatch({ type: "STOP_AND_SUBMIT" });
      const audio = await recorder.stop();
      if (audio.blob.size === 0) {
        dispatch({ type: "FAIL", message: "Nu s-a înregistrat niciun sunet. Verificați microfonul și încercați din nou.", retry: null });
        return;
      }
      pendingAudioRef.current = audio;
      await transcribe(audio);
    } finally {
      finishingRef.current = false;
    }
  }

  function pause() {
    recorder.pause();
    dispatch({ type: "PAUSE" });
  }

  function resume() {
    recorder.resume();
    dispatch({ type: "RESUME" });
  }

  function retryTranscription() {
    const audio = pendingAudioRef.current;
    if (!audio) return;
    dispatch({ type: "RETRY_TRANSCRIBE" });
    void transcribe(audio);
  }

  function regenerate() {
    const transcript = stateRef.current.transcript;
    if (!transcript) return;
    dispatch({ type: "REGENERATE" });
    void generate(transcript);
  }

  /** Clears every piece of clinical data held by this page. */
  const clearSession = useCallback((record: boolean) => {
    abortRef.current?.abort();
    abortRef.current = null;
    recorder.release();
    pendingAudioRef.current = null;
    dispatch({ type: "RESET" });
    setPatientInformed(false);
    if (record) void apiFetch("/api/consultation/events", { json: { type: "session_cleared" } }).catch(() => undefined);
  }, [recorder]);

  function requestCancel() {
    setConfirm({
      title: "Anulați consultația?",
      description: "Înregistrarea și orice date ale consultației curente vor fi eliminate din această pagină. Acțiunea nu poate fi anulată.",
      confirmLabel: "Anulează consultația",
      destructive: true,
      onConfirm: () => clearSession(true),
    });
  }

  function requestNewConsultation() {
    setConfirm({
      title: "Începeți o consultație nouă?",
      description: "Fișa și transcrierea curente vor fi șterse din această pagină. Asigurați-vă că ați copiat fișa în sistemul clinicii.",
      confirmLabel: "Consultație nouă",
      onConfirm: () => clearSession(true),
    });
  }

  function requestDeleteSession() {
    setConfirm({
      title: "Ștergeți sesiunea?",
      description: "Fișa, transcrierea de-identificată și toate datele consultației vor fi eliminate din această pagină.",
      confirmLabel: "Șterge sesiunea",
      destructive: true,
      onConfirm: () => clearSession(true),
    });
  }

  const enabledSpecialties = specialties.filter((s) => s.enabled);
  const remaining = MAX_RECORDING_SECONDS - recorder.elapsedSeconds;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">Consultație</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant={status === "error" ? "destructive" : status === "completed" ? "default" : isCapturing ? "warning" : "secondary"}
              data-testid="consultation-status"
              data-status={status}
            >
              {STATUS_LABELS[status]}
            </Badge>
          </div>
        </div>
        <div className="w-full sm:w-64">
          <Label htmlFor="specialty" className="mb-2 block text-xs text-muted-foreground">
            Șablon clinic
          </Label>
          <NativeSelect id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} disabled={status !== "idle"}>
            {enabledSpecialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {recorder.supportError && status === "idle" ? (
        <Alert variant="destructive">
          <MicOff />
          <AlertTitle>Înregistrarea nu este disponibilă</AlertTitle>
          <AlertDescription>{RECORDER_ERROR_MESSAGES[recorder.supportError]}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {status === "completed" && state.note !== null ? (
            <NoteEditor
              note={state.note}
              edited={state.note !== state.generatedNote}
              warnings={state.warnings}
              provider={state.provider}
              transcript={state.transcript}
              redactionTotal={state.redactionTotal}
              regenerating={false}
              onChange={(note) => dispatch({ type: "NOTE_EDITED", note })}
              onCopy={() => copyTextToClipboard(state.note ?? "")}
              onRegenerate={regenerate}
              onNewConsultation={requestNewConsultation}
              onDeleteSession={requestDeleteSession}
            />
          ) : (
            <>
              {/* Patient information confirmation */}
              <Card className={cn(patientInformed && "border-primary/40")}>
                <CardContent className="flex items-start gap-4 p-5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <UserCheck className="size-5" />
                  </span>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="patient-informed"
                      checked={patientInformed}
                      onCheckedChange={(v) => setPatientInformed(v === true)}
                      disabled={status !== "idle" && status !== "error"}
                      data-testid="patient-informed"
                    />
                    <Label htmlFor="patient-informed" className="text-sm font-normal leading-relaxed text-navy">
                      Am informat pacientul că această consultație este înregistrată în scopul redactării documentației medicale și
                      despre modul de prelucrare a datelor. Pacientul și-a exprimat acordul.
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {/* Recorder */}
              <Card>
                <CardContent className="p-6 sm:p-10">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative flex size-40 items-center justify-center">
                      {status === "recording" ? (
                        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-red-400/40" />
                      ) : null}
                      <span
                        className={cn(
                          "relative flex size-32 items-center justify-center rounded-full border-8 transition-colors",
                          status === "recording" && "border-red-100 bg-red-500 text-white",
                          status === "paused" && "border-amber-100 bg-amber-500 text-white",
                          isBusy && "border-emerald-50 bg-accent text-primary",
                          !isCapturing && !isBusy && "border-muted bg-navy text-white",
                        )}
                        data-testid="recording-indicator"
                      >
                        {isBusy ? (
                          <Loader2 className="size-12 animate-spin" />
                        ) : status === "paused" ? (
                          <Pause className="size-12" />
                        ) : status === "requesting_permission" ? (
                          <Loader2 className="size-12 animate-spin" />
                        ) : (
                          <Mic className="size-12" />
                        )}
                      </span>
                    </div>

                    <p className="mt-6 text-5xl font-semibold tabular-nums tracking-tight text-navy" data-testid="recording-duration" aria-live="off">
                      {formatDuration(recorder.elapsedSeconds)}
                    </p>

                    <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground" data-testid="mic-status">
                      {recorder.micStatus === "active" ? (
                        <>
                          <Mic className="size-4 text-primary" /> Microfon activ
                          <MicLevel level={recorder.level} active={status === "recording"} />
                        </>
                      ) : recorder.micStatus === "muted" ? (
                        <>
                          <MicOff className="size-4 text-warning" /> Microfonul nu transmite semnal
                        </>
                      ) : (
                        <>
                          <MicOff className="size-4" /> Microfon inactiv
                        </>
                      )}
                    </div>
                    {status === "recording" && remaining < 300 ? (
                      <p className="mt-2 text-xs text-warning">Înregistrarea se va opri automat în {formatDuration(remaining)}.</p>
                    ) : null}

                    {/* Controls */}
                    <div className="mt-8 flex w-full max-w-xl flex-col gap-3">
                      {status === "idle" ? (
                        <Button
                          size="xl"
                          onClick={startRecording}
                          disabled={!patientInformed || recorder.supportError !== null}
                          data-testid="start-recording"
                        >
                          <Mic /> Pornește înregistrarea
                        </Button>
                      ) : null}
                      {status === "idle" && !patientInformed ? (
                        <p className="text-xs text-muted-foreground">Confirmați informarea pacientului pentru a putea porni înregistrarea.</p>
                      ) : null}

                      {status === "recording" || status === "paused" ? (
                        <>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {status === "recording" ? (
                              <Button size="lg" variant="outline" onClick={pause} data-testid="pause-recording">
                                <Pause /> Pauză
                              </Button>
                            ) : (
                              <Button size="lg" variant="outline" onClick={resume} data-testid="resume-recording">
                                <Play /> Reia înregistrarea
                              </Button>
                            )}
                            <Button size="lg" variant="ghost" className="text-destructive hover:text-destructive" onClick={requestCancel} data-testid="cancel-consultation">
                              <X /> Anulează consultația
                            </Button>
                          </div>
                          <Button size="xl" onClick={finishAndGenerate} data-testid="finish-and-generate">
                            <Sparkles /> Finalizează și Generează Fișa
                          </Button>
                        </>
                      ) : null}

                      {isBusy ? (
                        <Button size="lg" variant="ghost" className="text-destructive hover:text-destructive" onClick={requestCancel} data-testid="cancel-processing">
                          <CircleStop /> Anulează
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Error */}
              {status === "error" && state.error ? (
                <Alert variant="destructive" data-testid="consultation-error">
                  <AlertCircle />
                  <AlertTitle>A apărut o problemă</AlertTitle>
                  <AlertDescription>
                    <p>{state.error.message}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {state.error.retry === "start" ? (
                        <Button size="sm" onClick={startRecording} disabled={!patientInformed}>
                          <RotateCcw /> Încearcă din nou
                        </Button>
                      ) : null}
                      {state.error.retry === "transcribe" && pendingAudioRef.current ? (
                        <Button size="sm" onClick={retryTranscription} data-testid="retry-transcription">
                          <RotateCcw /> Reîncearcă procesarea
                        </Button>
                      ) : null}
                      {state.error.retry === "generate" && state.transcript ? (
                        <Button size="sm" onClick={regenerate} data-testid="retry-generation">
                          <RotateCcw /> Reîncearcă generarea fișei
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => clearSession(true)}>
                        Începe din nou
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          )}
        </div>

        <aside className="space-y-6">
          {isBusy || (status === "generating_note" && state.transcript) ? (
            <Card>
              <CardHeader>
                <CardTitle>Procesare</CardTitle>
                <CardDescription>Nu închideți pagina.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProcessingSteps status={status} uploadProgress={state.uploadProgress} />
              </CardContent>
            </Card>
          ) : null}
          <PrivacyPanel />
        </aside>
      </div>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
