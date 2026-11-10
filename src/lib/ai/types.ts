import type { SpecialtyId } from "@/types/domain";

/**
 * Clinical note generation abstraction. Implementations receive ONLY a
 * redacted transcript and MUST NOT persist or log prompts or outputs.
 */
export interface ClinicalNoteProvider {
  readonly name: string;
  generateNote(transcript: string, specialty?: SpecialtyId): Promise<string>;
}

export class NoteProviderError extends Error {
  readonly kind: "refusal" | "unavailable" | "invalid_output" | "config";
  constructor(message: string, kind: NoteProviderError["kind"]) {
    super(message);
    this.name = "NoteProviderError";
    this.kind = kind;
  }
}
