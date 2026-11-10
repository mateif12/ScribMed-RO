import { SYNTHETIC_TRANSCRIPTS } from "./synthetic-transcripts";
import type { SpeechToTextProvider, TranscribeOptions } from "./types";
import { SpeechProviderError } from "./types";

/**
 * Development/test provider. Ignores the audio content and returns one of the
 * synthetic transcripts, chosen deterministically from the audio length so the
 * demo is reproducible. Audio is never stored.
 */
export class MockSpeechProvider implements SpeechToTextProvider {
  readonly name = "mock";
  constructor(private readonly latencyMs = 0) {}

  async transcribe(audio: Buffer | Uint8Array, options?: TranscribeOptions): Promise<string> {
    if (audio.byteLength === 0) {
      throw new SpeechProviderError("Audio gol", { retryable: false, kind: "empty" });
    }
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.latencyMs);
        options?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new SpeechProviderError("Anulat", { retryable: false }));
        });
      });
    }
    const index = audio.byteLength % SYNTHETIC_TRANSCRIPTS.length;
    return (SYNTHETIC_TRANSCRIPTS[index] ?? SYNTHETIC_TRANSCRIPTS[0]!).text;
  }
}
