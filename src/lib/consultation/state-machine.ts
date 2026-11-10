/**
 * Consultation workflow state machine (pure, framework-free, unit-tested).
 *
 * idle → requesting_permission → recording ⇄ paused → uploading → transcribing
 *      → redacting → generating_note → completed
 * Any active state → error. RESET from anywhere → idle (clears all clinical data).
 *
 * All clinical data (transcript, note) lives ONLY in this in-memory state.
 * It is never written to localStorage/sessionStorage/IndexedDB.
 */
export type ConsultationStatus =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "paused"
  | "uploading"
  | "transcribing"
  | "redacting"
  | "generating_note"
  | "completed"
  | "error";

export type RetryAction = "start" | "transcribe" | "generate";

export interface ConsultationError {
  message: string;
  retry: RetryAction | null;
}

export interface GeneratedNoteWarning {
  code: string;
  message: string;
}

export interface ConsultationState {
  status: ConsultationStatus;
  /** Status in which the error occurred (for retry routing / UI). */
  failedIn: ConsultationStatus | null;
  error: ConsultationError | null;
  uploadProgress: number;
  /** De-identified transcript returned by the server (memory only). */
  transcript: string | null;
  redactionTotal: number;
  note: string | null;
  /** Original generated note – lets the UI show whether the doctor edited it. */
  generatedNote: string | null;
  warnings: GeneratedNoteWarning[];
  provider: string | null;
}

export type ConsultationEvent =
  | { type: "START_REQUESTED" }
  | { type: "PERMISSION_GRANTED" }
  | { type: "PERMISSION_DENIED"; message: string }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP_AND_SUBMIT" }
  | { type: "UPLOAD_PROGRESS"; progress: number }
  | { type: "UPLOAD_COMPLETE" }
  | { type: "REDACTION_STARTED" }
  | { type: "TRANSCRIPT_READY"; transcript: string; redactionTotal: number }
  | { type: "NOTE_READY"; note: string; warnings: GeneratedNoteWarning[]; provider: string }
  | { type: "NOTE_EDITED"; note: string }
  | { type: "REGENERATE" }
  | { type: "RETRY_TRANSCRIBE" }
  | { type: "FAIL"; message: string; retry?: RetryAction | null }
  | { type: "RECORDING_INTERRUPTED"; message: string }
  | { type: "RESET" };

export const initialConsultationState: ConsultationState = {
  status: "idle",
  failedIn: null,
  error: null,
  uploadProgress: 0,
  transcript: null,
  redactionTotal: 0,
  note: null,
  generatedNote: null,
  warnings: [],
  provider: null,
};

/** Allowed transitions: event type → set of source states. */
export const TRANSITIONS: Record<ConsultationEvent["type"], readonly ConsultationStatus[]> = {
  START_REQUESTED: ["idle", "error"],
  PERMISSION_GRANTED: ["requesting_permission"],
  PERMISSION_DENIED: ["requesting_permission"],
  PAUSE: ["recording"],
  RESUME: ["paused"],
  STOP_AND_SUBMIT: ["recording", "paused"],
  UPLOAD_PROGRESS: ["uploading"],
  UPLOAD_COMPLETE: ["uploading"],
  REDACTION_STARTED: ["transcribing"],
  TRANSCRIPT_READY: ["transcribing", "redacting"],
  NOTE_READY: ["generating_note"],
  NOTE_EDITED: ["completed"],
  REGENERATE: ["completed", "error"],
  RETRY_TRANSCRIBE: ["error"],
  FAIL: ["requesting_permission", "recording", "paused", "uploading", "transcribing", "redacting", "generating_note"],
  RECORDING_INTERRUPTED: ["recording", "paused"],
  RESET: [
    "idle", "requesting_permission", "recording", "paused", "uploading", "transcribing",
    "redacting", "generating_note", "completed", "error",
  ],
};

export function canTransition(status: ConsultationStatus, event: ConsultationEvent["type"]): boolean {
  return TRANSITIONS[event].includes(status);
}

export const BUSY_STATUSES: readonly ConsultationStatus[] = ["uploading", "transcribing", "redacting", "generating_note"];
export const CAPTURE_STATUSES: readonly ConsultationStatus[] = ["requesting_permission", "recording", "paused"];

export function consultationReducer(state: ConsultationState, event: ConsultationEvent): ConsultationState {
  if (!canTransition(state.status, event.type)) return state;

  switch (event.type) {
    case "START_REQUESTED":
      return { ...initialConsultationState, status: "requesting_permission" };
    case "PERMISSION_GRANTED":
      return { ...state, status: "recording" };
    case "PERMISSION_DENIED":
      return { ...state, status: "error", failedIn: "requesting_permission", error: { message: event.message, retry: "start" } };
    case "PAUSE":
      return { ...state, status: "paused" };
    case "RESUME":
      return { ...state, status: "recording" };
    case "STOP_AND_SUBMIT":
      return { ...state, status: "uploading", uploadProgress: 0, error: null, failedIn: null };
    case "UPLOAD_PROGRESS":
      return { ...state, uploadProgress: Math.max(0, Math.min(100, Math.round(event.progress))) };
    case "UPLOAD_COMPLETE":
      return { ...state, status: "transcribing", uploadProgress: 100 };
    case "REDACTION_STARTED":
      return { ...state, status: "redacting" };
    case "TRANSCRIPT_READY":
      return { ...state, status: "generating_note", transcript: event.transcript, redactionTotal: event.redactionTotal };
    case "NOTE_READY":
      return { ...state, status: "completed", note: event.note, generatedNote: event.note, warnings: event.warnings, provider: event.provider, error: null, failedIn: null };
    case "NOTE_EDITED":
      return { ...state, note: event.note };
    case "REGENERATE":
      // Only possible when a transcript is held in memory.
      if (!state.transcript) return state;
      return { ...state, status: "generating_note", error: null, failedIn: null };
    case "RETRY_TRANSCRIBE":
      if (state.error?.retry !== "transcribe") return state;
      return { ...state, status: "uploading", uploadProgress: 0, error: null, failedIn: null };
    case "FAIL":
      return {
        ...state,
        status: "error",
        failedIn: state.status,
        error: { message: event.message, retry: event.retry ?? null },
      };
    case "RECORDING_INTERRUPTED":
      return { ...state, status: "error", failedIn: state.status, error: { message: event.message, retry: "transcribe" } };
    case "RESET":
      return { ...initialConsultationState };
  }
}

export const STATUS_LABELS: Record<ConsultationStatus, string> = {
  idle: "Pregătit",
  requesting_permission: "Se solicită accesul la microfon",
  recording: "Înregistrare în curs",
  paused: "Înregistrare în pauză",
  uploading: "Se trimite înregistrarea",
  transcribing: "Se transcrie consultația",
  redacting: "Se elimină datele de identificare",
  generating_note: "Se generează fișa medicală",
  completed: "Fișă generată – necesită verificare",
  error: "Eroare",
};

/** Ordered processing steps for the progress indicator. */
export const PROCESSING_STEPS: { status: ConsultationStatus; label: string }[] = [
  { status: "uploading", label: "Încărcare securizată" },
  { status: "transcribing", label: "Transcriere vorbire" },
  { status: "redacting", label: "Eliminare date personale" },
  { status: "generating_note", label: "Redactare fișă" },
];
