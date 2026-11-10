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

export class SpeechProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  constructor(message: string, opts: { retryable: boolean; status?: number | null }) {
    super(message);
    this.name = "SpeechProviderError";
    this.retryable = opts.retryable;
    this.status = opts.status ?? null;
  }
}
