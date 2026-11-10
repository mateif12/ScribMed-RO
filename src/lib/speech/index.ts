import "server-only";
import { getEnv } from "@/config/env";
import { AzureSpeechProvider } from "./azure-speech-provider";
import { MockSpeechProvider } from "./mock-speech-provider";
import type { SpeechToTextProvider } from "./types";

let instance: SpeechToTextProvider | null = null;

export function getSpeechProvider(): SpeechToTextProvider {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.SPEECH_PROVIDER === "azure"
      ? new AzureSpeechProvider({
          apiKey: env.AZURE_SPEECH_KEY ?? "",
          region: env.AZURE_SPEECH_REGION,
          endpoint: env.AZURE_SPEECH_ENDPOINT,
          locale: env.AZURE_SPEECH_LOCALE,
          apiVersion: env.AZURE_SPEECH_API_VERSION,
          timeoutMs: env.AZURE_SPEECH_TIMEOUT_MS,
          diarization: env.AZURE_SPEECH_DIARIZATION,
          maxRetries: env.AZURE_SPEECH_MAX_RETRIES,
        })
      : new MockSpeechProvider(env.MOCK_PROVIDER_LATENCY_MS);
  return instance;
}

/** Test hook. */
export function setSpeechProvider(p: SpeechToTextProvider | null): void {
  instance = p;
}

export type { SpeechToTextProvider } from "./types";
