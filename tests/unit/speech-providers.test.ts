import { describe, expect, it, vi } from "vitest";
import { AzureSpeechProvider, formatAzureTranscript } from "@/lib/speech/azure-speech-provider";
import { MockSpeechProvider } from "@/lib/speech/mock-speech-provider";
import { SYNTHETIC_TRANSCRIPTS } from "@/lib/speech/synthetic-transcripts";
import { SpeechProviderError } from "@/lib/speech/types";

const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);

describe("MockSpeechProvider", () => {
  it("returns a synthetic Romanian transcript deterministically", async () => {
    const p = new MockSpeechProvider();
    const t1 = await p.transcribe(audio);
    const t2 = await p.transcribe(audio);
    expect(t1).toBe(t2);
    expect(SYNTHETIC_TRANSCRIPTS.map((t) => t.text)).toContain(t1);
  });
  it("rejects empty audio", async () => {
    await expect(new MockSpeechProvider().transcribe(new Uint8Array())).rejects.toBeInstanceOf(SpeechProviderError);
  });
});

describe("AzureSpeechProvider (fast transcription REST)", () => {
  const config = { apiKey: "test-key", region: "westeurope", locale: "ro-RO", apiVersion: "2024-11-15", timeoutMs: 10_000 };

  it("posts multipart audio + definition with ro-RO to the regional endpoint, key in header only", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ durationMilliseconds: 1000, combinedPhrases: [{ text: "Bună ziua." }, { text: "Mă doare capul." }] }),
    );
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch });
    const text = await p.transcribe(audio, { mimeType: "audio/webm" });
    expect(text).toBe("Bună ziua.\nMă doare capul.");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://westeurope.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15");
    expect(String(url)).not.toContain("test-key");
    expect((init!.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("test-key");
    const form = init!.body as FormData;
    expect(JSON.parse(String(form.get("definition")))).toEqual({ locales: ["ro-RO"], profanityFilterMode: "None" });
    const file = form.get("audio") as File;
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(audio.byteLength);
  });

  it("supports a custom endpoint and diarization", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        phrases: [
          { text: "Ce vă supără?", speaker: 1, offsetMilliseconds: 0 },
          { text: "Tusea.", speaker: 2, offsetMilliseconds: 900 },
          { text: "De când?", speaker: 1, offsetMilliseconds: 2000 },
        ],
      }),
    );
    const p = new AzureSpeechProvider({ ...config, endpoint: "https://res.cognitiveservices.azure.com/", diarization: true, fetchImpl: fetchImpl as unknown as typeof fetch });
    const text = await p.transcribe(audio);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/res\.cognitiveservices\.azure\.com\/speechtotext/);
    expect(text).toBe("Vorbitor 1: Ce vă supără?\nVorbitor 2: Tusea.\nVorbitor 1: De când?");
  });

  it("maps HTTP errors to SpeechProviderError without exposing the response body", async () => {
    const fetchImpl = vi.fn(async () => new Response("secret details", { status: 429 }));
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await p.transcribe(audio).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpeechProviderError);
    expect((err as SpeechProviderError).retryable).toBe(true);
    expect((err as SpeechProviderError).status).toBe(429);
    expect((err as Error).message).not.toContain("secret");
  });

  it("maps network failures to a retryable error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.transcribe(audio)).rejects.toMatchObject({ retryable: true });
  });

  it("requires an API key", () => {
    expect(() => new AzureSpeechProvider({ ...config, apiKey: "" })).toThrow();
  });

  it("formats empty responses as empty transcript", () => {
    expect(formatAzureTranscript({}, false)).toBe("");
  });
});
