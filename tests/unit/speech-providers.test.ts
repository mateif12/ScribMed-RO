import { describe, expect, it, vi } from "vitest";
import { AzureSpeechProvider, classifyStatus, formatAzureTranscript } from "@/lib/speech/azure-speech-provider";
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

  it("maps HTTP errors to typed, content-free SpeechProviderErrors", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ code: "TooManyRequests", message: "secret details about Pacient X" }, { status: 429 }));
    const p = new AzureSpeechProvider({ ...config, maxRetries: 0, fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = (await p.transcribe(audio).catch((e: unknown) => e)) as SpeechProviderError;
    expect(err).toBeInstanceOf(SpeechProviderError);
    expect(err).toMatchObject({ kind: "rate_limited", retryable: true, status: 429, providerCode: "TooManyRequests" });
    expect(err.message).not.toContain("secret");
    expect(JSON.stringify(err)).not.toContain("Pacient");
  });

  it("maps UnsupportedMediaType to a browser-specific Romanian message", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ code: "UnsupportedMediaType", message: "x" }, { status: 415 }));
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = (await p.transcribe(audio, { mimeType: "audio/mp4" }).catch((e: unknown) => e)) as SpeechProviderError;
    expect(err.kind).toBe("unsupported_media");
    expect(err.message).toMatch(/Chrome, Edge sau Firefox/);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // non-retryable
  });

  it("ignores provider error codes outside the documented enum", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ code: "Ion Popescu 1840512400123" }, { status: 400 }));
    const err = (await new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch }).transcribe(audio).catch((e: unknown) => e)) as SpeechProviderError;
    expect(err.providerCode).toBeNull();
    expect(err.kind).toBe("invalid_request");
  });

  it("classifies auth failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    const err = (await new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch }).transcribe(audio).catch((e: unknown) => e)) as SpeechProviderError;
    expect(err).toMatchObject({ kind: "auth", retryable: false });
  });

  it("retries once on 503 honouring Retry-After, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(Response.json({ durationMilliseconds: 1, combinedPhrases: [{ text: "ok" }], phrases: [] }));
    const sleep = vi.fn(async () => undefined);
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch, sleep });
    expect(await p.transcribe(audio)).toBe("ok");
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not wait for absurd Retry-After values", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 429, headers: { "retry-after": "3600" } }));
    const sleep = vi.fn(async () => undefined);
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch, sleep });
    await expect(p.transcribe(audio)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("maps network failures to a retryable error after retrying", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.1");
    });
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => undefined });
    const err = (await p.transcribe(audio).catch((e: unknown) => e)) as SpeechProviderError;
    expect(err).toMatchObject({ kind: "network", retryable: true });
    expect(err.message).not.toContain("ECONNREFUSED");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("enforces one overall deadline (explicit timeout)", async () => {
    const fetchImpl = vi.fn(
      (_u: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => init!.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))),
    );
    const p = new AzureSpeechProvider({ ...config, timeoutMs: 50, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.transcribe(audio)).rejects.toMatchObject({ kind: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("verifies locale support via the documented Transcribe locales list", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ Transcribe: ["en-US", "ro-RO"], Submit: ["ro-RO"] }));
    const p = new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await p.verifyLocale()).toMatchObject({ supported: true });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe(
      "https://westeurope.api.cognitive.microsoft.com/speechtotext/transcriptions/locales?api-version=2024-11-15",
    );
    const none = vi.fn(async () => Response.json({ Transcribe: ["en-US"] }));
    expect((await new AzureSpeechProvider({ ...config, fetchImpl: none as unknown as typeof fetch }).verifyLocale()).supported).toBe(false);
  });

  it("rejects empty audio without calling Azure", async () => {
    const fetchImpl = vi.fn();
    await expect(new AzureSpeechProvider({ ...config, fetchImpl: fetchImpl as unknown as typeof fetch }).transcribe(new Uint8Array())).rejects.toMatchObject({ kind: "empty" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifyStatus covers timeouts and server errors", () => {
    expect(classifyStatus(504, null)).toBe("timeout");
    expect(classifyStatus(500, "InternalServerError")).toBe("unavailable");
  });

  it("requires an API key", () => {
    expect(() => new AzureSpeechProvider({ ...config, apiKey: "" })).toThrow();
  });

  it("formats empty responses as empty transcript", () => {
    expect(formatAzureTranscript({}, false)).toBe("");
  });
});
