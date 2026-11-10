/**
 * Verifies a real Azure AI Speech setup with SYNTHETIC data only.
 *
 *   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=westeurope npm run verify:azure
 *   npm run verify:azure -- --audio ./synthetic-consultation.webm [--show]
 *
 * Checks:
 *  1. The key/endpoint work and the locale (default ro-RO) is offered for fast
 *     transcription by this resource (`GET /speechtotext/transcriptions/locales`, field `Transcribe`).
 *  2. Optionally transcribes a SYNTHETIC recording you provide (e.g. text-to-speech of a
 *     fictional dialogue) through the production adapter, then applies PII redaction.
 *     Only lengths and redaction counts are printed unless --show is passed
 *     (which prints the REDACTED transcript only).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { scrubPiiSync } from "../src/lib/security/pii-scrubber";
import { AzureSpeechProvider } from "../src/lib/speech/azure-speech-provider";
import { SpeechProviderError } from "../src/lib/speech/types";
import { sniffAudioContainer } from "../src/lib/validation/audio";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apiKey = process.env.AZURE_SPEECH_KEY;
  if (!apiKey) {
    console.error("AZURE_SPEECH_KEY lipsește.");
    process.exit(2);
  }
  const locale = process.env.AZURE_SPEECH_LOCALE ?? "ro-RO";
  const provider = new AzureSpeechProvider({
    apiKey,
    region: process.env.AZURE_SPEECH_REGION ?? "westeurope",
    endpoint: process.env.AZURE_SPEECH_ENDPOINT || undefined,
    locale,
    apiVersion: process.env.AZURE_SPEECH_API_VERSION ?? "2024-11-15",
    timeoutMs: Number(process.env.AZURE_SPEECH_TIMEOUT_MS ?? 600000),
    maxRetries: 0,
    diarization: process.env.AZURE_SPEECH_DIARIZATION === "true",
  });
  let failed = false;

  try {
    const { supported, transcribeLocales } = await provider.verifyLocale(locale);
    console.info(
      `[${supported ? "OK" : "FAIL"}] Locale ${locale} pentru fast transcription: ${supported ? "suportat" : "NU este listat"} ` +
        `(${transcribeLocales.length} locale disponibile la ${new URL(provider.url).host})`,
    );
    failed ||= !supported;
  } catch (e) {
    const err = e as SpeechProviderError;
    console.error(`[FAIL] Lista de locale: ${err.kind ?? "error"} (HTTP ${err.status ?? "-"}, cod ${err.providerCode ?? "-"})`);
    failed = true;
  }

  const audioPath = arg("--audio");
  if (audioPath) {
    const bytes = new Uint8Array(readFileSync(path.resolve(audioPath)));
    const mimeType = sniffAudioContainer(bytes);
    if (!mimeType) {
      console.error("[FAIL] Fișierul nu este un container audio recunoscut (webm/ogg/wav/mp4/mp3).");
      process.exit(1);
    }
    const started = Date.now();
    try {
      const raw = await provider.transcribe(bytes, { mimeType, locale });
      const redacted = scrubPiiSync(raw);
      console.info(
        `[OK] Transcriere sintetică (${mimeType}, ${(bytes.byteLength / 1024).toFixed(0)} KB): ${Date.now() - started} ms, ` +
          `${raw.length} caractere, ${redacted.total} identificatori redactați`,
      );
      if (process.argv.includes("--show")) console.info(`\n${redacted.text}\n`);
    } catch (e) {
      const err = e as SpeechProviderError;
      console.error(`[FAIL] Transcriere: ${err.kind ?? "error"} (HTTP ${err.status ?? "-"}, cod ${err.providerCode ?? "-"}): ${err.message}`);
      failed = true;
    }
  } else {
    console.info("[INFO] Fără --audio: transcrierea nu a fost testată (furnizați o înregistrare SINTETICĂ).");
  }
  process.exit(failed ? 1 : 0);
}

void main();
