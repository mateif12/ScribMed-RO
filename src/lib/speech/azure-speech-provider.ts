import type { SpeechToTextProvider, TranscribeOptions } from "./types";
import { SPEECH_ERROR_MESSAGES, SpeechProviderError, type SpeechErrorKind } from "./types";

export interface AzureSpeechConfig {
  /** Subscription key – server-side only. */
  apiKey: string;
  /** Azure region of the Speech resource, e.g. "westeurope". */
  region: string;
  /** Optional custom endpoint (e.g. https://<resource>.cognitiveservices.azure.com). */
  endpoint?: string;
  locale: string;
  apiVersion: string;
  /** Overall deadline for one transcription, including retries. */
  timeoutMs: number;
  /** Retries for 429 / 5xx / network errors (within the same deadline). Default 1. */
  maxRetries?: number;
  /** Enable speaker diarization (2 speakers: doctor + patient). */
  diarization?: boolean;
  fetchImpl?: typeof fetch;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Response shape of `Transcriptions_Transcribe` (TranscribeResult), verified
 * against Microsoft's OpenAPI specification
 * (azure-rest-api-specs: cognitiveservices/data-plane/SpeechToText/stable/2024-11-15).
 * Required by the spec: durationMilliseconds, combinedPhrases[].text, phrases[].text/offset/duration/confidence.
 */
interface TranscribeResult {
  durationMilliseconds?: number;
  combinedPhrases?: Array<{ text?: string; channel?: number }>;
  phrases?: Array<{ text?: string; speaker?: number; offsetMilliseconds?: number }>;
}

/** `ErrorCode` enum from the same specification – the only error detail we ever read. */
const AZURE_ERROR_CODES = new Set([
  "InvalidRequest", "InvalidArgument", "InternalServerError", "ServiceUnavailable", "NotFound", "PipelineError",
  "Conflict", "InternalCommunicationFailed", "Forbidden", "NotAllowed", "Unauthorized", "UnsupportedMediaType",
  "TooManyRequests", "UnprocessableEntity",
]);

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 10_000;

/**
 * Azure AI Speech – Fast Transcription REST API (synchronous, file based).
 *
 * Verified contract (OpenAPI 2024-11-15):
 *   POST {endpoint}/speechtotext/transcriptions:transcribe?api-version=2024-11-15
 *   header Ocp-Apim-Subscription-Key; multipart/form-data with
 *   `audio` (file, < 2 h and < 250 MB) and `definition` (JSON TranscribeDefinition:
 *   locales[], profanityFilterMode, diarization{enabled,maxSpeakers}).
 *
 * Chosen over the short-audio REST API (~60 s limit) because consultations last
 * 10–30 minutes, and over batch transcription, which requires uploading audio
 * to blob storage (persistent storage we want to avoid).
 *
 * NOT verifiable from the specification (see docs/deployment.md): regional
 * availability of fast transcription, ro-RO support for a given resource
 * (checked at runtime by `verifyLocale()` / `npm run verify:azure`) and the
 * accepted containers (Microsoft documentation lists WAV, MP3, OPUS/OGG, FLAC,
 * WMA, AAC, ALAW/MULAW in WAV, AMR, WebM and SPEEX – MP4/M4A is not listed).
 *
 * Privacy: the audio is sent in the request body only; nothing is written to
 * disk; neither audio, transcript nor provider error messages are logged.
 */
export class AzureSpeechProvider implements SpeechToTextProvider {
  readonly name = "azure";
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly config: AzureSpeechConfig) {
    if (!config.apiKey) throw new Error("AZURE_SPEECH_KEY lipsește");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleep = config.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private get baseUrl(): string {
    return this.config.endpoint?.replace(/\/+$/, "") ?? `https://${this.config.region}.api.cognitive.microsoft.com`;
  }

  get url(): string {
    return `${this.baseUrl}/speechtotext/transcriptions:transcribe?api-version=${encodeURIComponent(this.config.apiVersion)}`;
  }

  get localesUrl(): string {
    return `${this.baseUrl}/speechtotext/transcriptions/locales?api-version=${encodeURIComponent(this.config.apiVersion)}`;
  }

  async transcribe(audio: Buffer | Uint8Array, options?: TranscribeOptions): Promise<string> {
    if (audio.byteLength === 0) throw new SpeechProviderError(SPEECH_ERROR_MESSAGES.empty, { retryable: false, kind: "empty" });

    const definition: Record<string, unknown> = {
      locales: [options?.locale ?? this.config.locale],
      profanityFilterMode: "None",
    };
    if (this.config.diarization) definition.diarization = { enabled: true, maxSpeakers: 2 };
    const definitionJson = JSON.stringify(definition);
    const mimeType = options?.mimeType ?? "audio/webm";
    const view = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength) as Uint8Array<ArrayBuffer>;

    // One overall deadline for all attempts – a 30-minute recording cannot hang the request.
    const deadline = AbortSignal.timeout(this.config.timeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    const maxRetries = this.config.maxRetries ?? 1;

    for (let attempt = 0; ; attempt++) {
      const form = new FormData();
      form.append("audio", new Blob([view], { type: mimeType }), "consultatie");
      form.append("definition", definitionJson);

      let res: Response;
      try {
        res = await this.fetchImpl(this.url, {
          method: "POST",
          headers: { "Ocp-Apim-Subscription-Key": this.config.apiKey, Accept: "application/json" },
          body: form,
          signal,
          cache: "no-store",
        });
      } catch (err) {
        if (deadline.aborted) throw this.error("timeout", null, null);
        if (options?.signal?.aborted) throw new SpeechProviderError("Anulat", { retryable: false, kind: "network" });
        if (attempt < maxRetries) {
          await this.sleep(1000 * 2 ** attempt);
          continue;
        }
        void err; // never surface low-level error text
        throw this.error("network", null, null);
      }

      if (res.ok) {
        let data: TranscribeResult;
        try {
          data = (await res.json()) as TranscribeResult;
        } catch {
          throw this.error("unavailable", res.status, null);
        }
        return formatAzureTranscript(data, Boolean(this.config.diarization));
      }

      const providerCode = await readErrorCode(res);
      if (RETRYABLE_STATUSES.has(res.status) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        if (wait <= MAX_BACKOFF_MS) {
          await this.sleep(wait);
          continue;
        }
      }
      throw this.error(classifyStatus(res.status, providerCode), res.status, providerCode);
    }
  }

  /**
   * Checks that the configured locale is offered for fast transcription by this
   * resource (`Transcriptions_ListSupportedLocales`, field `Transcribe`).
   */
  async verifyLocale(locale = this.config.locale): Promise<{ supported: boolean; transcribeLocales: string[] }> {
    const res = await this.fetchImpl(this.localesUrl, {
      headers: { "Ocp-Apim-Subscription-Key": this.config.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const code = await readErrorCode(res);
      throw this.error(classifyStatus(res.status, code), res.status, code);
    }
    const data = (await res.json()) as { Transcribe?: string[] };
    const transcribeLocales = Array.isArray(data.Transcribe) ? data.Transcribe : [];
    return { supported: transcribeLocales.includes(locale), transcribeLocales };
  }

  private error(kind: SpeechErrorKind, status: number | null, providerCode: string | null): SpeechProviderError {
    return new SpeechProviderError(SPEECH_ERROR_MESSAGES[kind], {
      kind,
      status,
      providerCode,
      retryable: kind === "rate_limited" || kind === "unavailable" || kind === "network" || kind === "timeout",
    });
  }
}

/** Reads only the enum `code` from an Azure error body; discards everything else. */
async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { code?: unknown; error?: { code?: unknown } };
    const code = body?.code ?? body?.error?.code;
    return typeof code === "string" && AZURE_ERROR_CODES.has(code) ? code : null;
  } catch {
    return null;
  }
}

export function classifyStatus(status: number, providerCode: string | null): SpeechErrorKind {
  if (status === 415 || providerCode === "UnsupportedMediaType") return "unsupported_media";
  if (status === 401 || status === 403 || providerCode === "Unauthorized" || providerCode === "Forbidden") return "auth";
  if (status === 429 || providerCode === "TooManyRequests") return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "unavailable";
  return "invalid_request";
}

/**
 * Builds the transcript text. With diarization, phrases are prefixed with
 * neutral speaker labels. Azure assigns speaker numbers "without particular
 * order", so labels are NEVER mapped to doctor/patient roles here.
 */
export function formatAzureTranscript(data: TranscribeResult, diarization: boolean): string {
  if (diarization && data.phrases?.length) {
    const lines: string[] = [];
    let currentSpeaker: number | undefined;
    for (const p of [...data.phrases].sort((a, b) => (a.offsetMilliseconds ?? 0) - (b.offsetMilliseconds ?? 0))) {
      const text = p.text?.trim();
      if (!text) continue;
      if (p.speaker !== currentSpeaker || lines.length === 0) {
        lines.push(`Vorbitor ${p.speaker ?? "?"}: ${text}`);
        currentSpeaker = p.speaker;
      } else {
        lines[lines.length - 1] += ` ${text}`;
      }
    }
    return lines.join("\n");
  }
  return (data.combinedPhrases ?? [])
    .map((p) => p.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}
