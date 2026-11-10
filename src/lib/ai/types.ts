import type { SpecialtyId } from "@/types/domain";

/**
 * Clinical note generation abstraction. Implementations receive ONLY a
 * redacted transcript and MUST NOT persist or log prompts or outputs.
 */
export interface ClinicalNoteProvider {
  readonly name: string;
  generateNote(transcript: string, specialty?: SpecialtyId): Promise<string>;
  /** Optional richer variant exposing which model actually produced the note. */
  generateNoteWithMetadata?(transcript: string, specialty?: SpecialtyId): Promise<NoteGeneration>;
}

export interface NoteGeneration {
  text: string;
  /** Model / inference-profile ID that produced the text. */
  model: string;
  /** True when the configured fallback model was used after a refusal. */
  fallbackUsed: boolean;
}

export type NoteProviderErrorKind =
  | "refusal"
  | "unavailable"
  | "invalid_output"
  | "config"
  | "bad_request"
  | "access_denied"
  | "rate_limited"
  | "timeout";

export class NoteProviderError extends Error {
  readonly kind: NoteProviderErrorKind;
  readonly status: number | null;
  constructor(message: string, kind: NoteProviderErrorKind, status: number | null = null) {
    super(message);
    this.name = "NoteProviderError";
    this.kind = kind;
    this.status = status;
  }
}
