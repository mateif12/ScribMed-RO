export interface TranscribeOptions {
  /** Normalised container MIME type, e.g. "audio/webm". */
  mimeType?: string;
  /** BCP-47 locale; defaults to ro-RO. */
  locale?: string;
  signal?: AbortSignal;
}

/**
 * Speech-to-text abstraction. Implementations MUST NOT persist or log audio
 * or transcript content.
 */
export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(audio: Buffer | Uint8Array, options?: TranscribeOptions): Promise<string>;
}

/** Content-free classification of provider failures (safe to log). */
export type SpeechErrorKind =
  | "unsupported_media"
  | "invalid_request"
  | "auth"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "network"
  | "empty";

/** User-facing Romanian messages per failure kind (never include provider text). */
export const SPEECH_ERROR_MESSAGES: Record<SpeechErrorKind, string> = {
  unsupported_media:
    "Formatul audio înregistrat de acest browser nu este acceptat de serviciul de transcriere. Folosiți Chrome, Edge sau Firefox.",
  invalid_request: "Serviciul de transcriere a respins înregistrarea. Încercați din nou.",
  auth: "Serviciul de transcriere nu este configurat corect. Contactați administratorul.",
  rate_limited: "Serviciul de transcriere este suprasolicitat. Reîncercați peste câteva momente.",
  timeout: "Transcrierea a durat prea mult și a fost oprită. Reîncercați.",
  unavailable: "Serviciul de transcriere este temporar indisponibil. Reîncercați.",
  network: "Serviciul de transcriere nu poate fi contactat. Reîncercați.",
  empty: "Înregistrarea este goală.",
};

export class SpeechProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  readonly kind: SpeechErrorKind;
  /** Provider error code from a fixed enum (e.g. Azure "UnsupportedMediaType"); never free text. */
  readonly providerCode: string | null;
  constructor(
    message: string,
    opts: { retryable: boolean; status?: number | null; kind?: SpeechErrorKind; providerCode?: string | null },
  ) {
    super(message);
    this.name = "SpeechProviderError";
    this.retryable = opts.retryable;
    this.status = opts.status ?? null;
    this.kind = opts.kind ?? (opts.retryable ? "unavailable" : "invalid_request");
    this.providerCode = opts.providerCode ?? null;
  }
}
