import type { SpeechToTextProvider, TranscribeOptions } from "./types";
import { SpeechProviderError } from "./types";

export interface AzureSpeechConfig {
  /** Subscription key – server-side only. */
  apiKey: string;
  /** Azure region of the Speech resource, e.g. "westeurope" / "germanywestcentral". */
  region: string;
  /** Optional custom endpoint (e.g. https://<resource>.cognitiveservices.azure.com). */
  endpoint?: string;
  locale: string;
  apiVersion: string;
  timeoutMs: number;
  /** Enable speaker diarization (2 speakers: doctor + patient). */
  diarization?: boolean;
  fetchImpl?: typeof fetch;
}

/** Shape of the Fast Transcription response fields we consume. */
interface FastTranscriptionResponse {
  durationMilliseconds?: number;
  combinedPhrases?: Array<{ text?: string; channel?: number }>;
  phrases?: Array<{ text?: string; speaker?: number; offsetMilliseconds?: number }>;
}

/**
 * Azure AI Speech – Fast Transcription REST API (synchronous, file based).
 * Chosen over the short-audio REST API (limited to ~60 s) because
 * consultations last 10–30 minutes, and over the Speech SDK because it needs
 * no native dependencies and no persistent storage (unlike batch transcription,
 * which requires the audio to be uploaded to blob storage).
 *
 * Verify before production: that ro-RO is listed for fast transcription and
 * that the chosen EU region supports the feature (see docs/deployment.md).
 *
 * The audio is streamed to Azure in the request body and is not written to
 * disk by this application. No transcript text is logged.
 */
export class AzureSpeechProvider implements SpeechToTextProvider {
  readonly name = "azure";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: AzureSpeechConfig) {
    if (!config.apiKey) throw new Error("AZURE_SPEECH_KEY lipsește");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  get url(): string {
    const base = this.config.endpoint?.replace(/\/+$/, "") ?? `https://${this.config.region}.api.cognitive.microsoft.com`;
    return `${base}/speechtotext/transcriptions:transcribe?api-version=${encodeURIComponent(this.config.apiVersion)}`;
  }

  async transcribe(audio: Buffer | Uint8Array, options?: TranscribeOptions): Promise<string> {
    const definition: Record<string, unknown> = {
      locales: [options?.locale ?? this.config.locale],
      profanityFilterMode: "None",
    };
    if (this.config.diarization) {
      definition.diarization = { enabled: true, maxSpeakers: 2 };
    }

    const form = new FormData();
    const view = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
    form.append("audio", new Blob([view as Uint8Array<ArrayBuffer>], { type: options?.mimeType ?? "audio/webm" }), "consultatie");
    form.append("definition", JSON.stringify(definition));

    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

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
      const aborted = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new SpeechProviderError(aborted ? "Timpul de transcriere a expirat" : "Serviciul de transcriere nu poate fi contactat", {
        retryable: true,
      });
    }

    if (!res.ok) {
      // Do not read/log the response body: keep error handling content-free.
      await res.body?.cancel().catch(() => undefined);
      throw new SpeechProviderError(`Serviciul de transcriere a răspuns cu statusul ${res.status}`, {
        retryable: res.status === 429 || res.status >= 500,
        status: res.status,
      });
    }

    const data = (await res.json()) as FastTranscriptionResponse;
    return formatAzureTranscript(data, Boolean(this.config.diarization));
  }
}

/** Builds the transcript text; with diarization, prefixes lines with speaker labels. */
export function formatAzureTranscript(data: FastTranscriptionResponse, diarization: boolean): string {
  if (diarization && data.phrases?.length) {
    const lines: string[] = [];
    let currentSpeaker: number | undefined;
    for (const p of [...data.phrases].sort((a, b) => (a.offsetMilliseconds ?? 0) - (b.offsetMilliseconds ?? 0))) {
      const text = p.text?.trim();
      if (!text) continue;
      if (p.speaker !== currentSpeaker) {
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
