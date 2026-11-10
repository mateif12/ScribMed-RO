import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as generateNote } from "@/app/api/generate-note/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { getEnv, resetEnvCache } from "@/config/env";
import { setClinicalNoteProvider } from "@/lib/ai";
import { Semaphore, getTranscriptionSemaphore } from "@/lib/security/concurrency";
import { setSpeechProvider } from "@/lib/speech";
import { SpeechProviderError, SPEECH_ERROR_MESSAGES } from "@/lib/speech/types";
import { fakeWebm, makeRequest, readNdjson, sessionCookieFor, setupWorld } from "../support/helpers";

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  resetEnvCache();
});

describe("environment validation (fail-closed)", () => {
  const prod = (extra: Record<string, string>) => {
    Object.assign(process.env, { NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), AUTH_PROVIDER: "cognito", COGNITO_USER_POOL_ID: "p", COGNITO_CLIENT_ID: "c" }, extra);
    resetEnvCache();
    return () => getEnv();
  };

  it("refuses mock providers in production unless explicitly allowed", () => {
    expect(prod({ SPEECH_PROVIDER: "mock", NOTE_PROVIDER: "mock" })).toThrow(/providerii mock/);
    expect(prod({ SPEECH_PROVIDER: "mock", NOTE_PROVIDER: "mock", ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: "true" })).not.toThrow();
  });

  it("requires an explicit BEDROCK_MODEL_ID (no guessed default)", () => {
    process.env.NOTE_PROVIDER = "bedrock";
    delete process.env.BEDROCK_MODEL_ID;
    resetEnvCache();
    expect(() => getEnv()).toThrow(/BEDROCK_MODEL_ID/);
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-sonnet-5-5";
    resetEnvCache();
    expect(getEnv().BEDROCK_MODEL_ID).toBe("anthropic.claude-sonnet-5-5");
  });

  it("requires https endpoint overrides in production", () => {
    expect(
      prod({ SPEECH_PROVIDER: "azure", AZURE_SPEECH_KEY: "k", AZURE_SPEECH_ENDPOINT: "http://speech.example", NOTE_PROVIDER: "bedrock", BEDROCK_MODEL_ID: "m" }),
    ).toThrow(/https/);
  });

  it("rejects region values that could alter the provider hostname", () => {
    process.env.AZURE_SPEECH_REGION = "evil.com/x";
    resetEnvCache();
    expect(() => getEnv()).toThrow(/regiune Azure/);
    delete process.env.AZURE_SPEECH_REGION;
    process.env.BEDROCK_REGION = "eu-central-1.attacker.net";
    resetEnvCache();
    expect(() => getEnv()).toThrow(/regiune AWS/);
  });

  it("does not expose secrets in validation errors", () => {
    process.env.SPEECH_PROVIDER = "azure";
    process.env.AZURE_SPEECH_KEY = "super-secret-key-value";
    process.env.AZURE_SPEECH_REGION = "bad region";
    resetEnvCache();
    try {
      getEnv();
    } catch (e) {
      expect((e as Error).message).not.toContain("super-secret-key-value");
    }
  });
});

describe("transcription concurrency cap", () => {
  it("Semaphore bounds concurrent holders and releases idempotently", () => {
    const s = new Semaphore(() => 2);
    const r1 = s.tryAcquire();
    const r2 = s.tryAcquire();
    expect(s.tryAcquire()).toBeNull();
    r1!();
    r1!();
    expect(s.inUse).toBe(1);
    expect(s.tryAcquire()).not.toBeNull();
    r2!();
  });

  it("the transcribe route answers 429 when all slots are busy, then releases its slot", async () => {
    const world = await setupWorld();
    const cookie = await sessionCookieFor(world.a.user);
    const sem = getTranscriptionSemaphore(() => getEnv().MAX_CONCURRENT_TRANSCRIPTIONS);
    const held = Array.from({ length: getEnv().MAX_CONCURRENT_TRANSCRIPTIONS }, () => sem.tryAcquire()!);
    const busy = await transcribe(makeRequest("/api/transcribe", { body: fakeWebm() as unknown as BodyInit, headers: { "content-type": "audio/webm" }, cookie }));
    expect(busy.status).toBe(429);
    expect(busy.headers.get("retry-after")).toBe("30");
    held.forEach((r) => r());
    const ok = await transcribe(makeRequest("/api/transcribe", { body: fakeWebm() as unknown as BodyInit, headers: { "content-type": "audio/webm" }, cookie }));
    await readNdjson(ok);
    expect(sem.inUse).toBe(0);
  });
});

describe("provider failures surface safely through the API", () => {
  beforeEach(() => resetEnvCache());

  it("speech UnsupportedMediaType → NDJSON error with Romanian guidance, no provider text", async () => {
    const world = await setupWorld();
    setSpeechProvider({
      name: "fake-azure",
      async transcribe() {
        throw new SpeechProviderError(SPEECH_ERROR_MESSAGES.unsupported_media, { retryable: false, kind: "unsupported_media", status: 415, providerCode: "UnsupportedMediaType" });
      },
    });
    const res = await transcribe(
      makeRequest("/api/transcribe", { body: fakeWebm() as unknown as BodyInit, headers: { "content-type": "audio/webm" }, cookie: await sessionCookieFor(world.a.user) }),
    );
    const last = (await readNdjson(res)).at(-1)!;
    expect(last.stage).toBe("error");
    expect(last.error).toEqual({ code: "UNSUPPORTED_MEDIA_TYPE", message: SPEECH_ERROR_MESSAGES.unsupported_media });
  });

  it("a fallback-model note carries a visible warning", async () => {
    const world = await setupWorld();
    setClinicalNoteProvider({
      name: "bedrock",
      generateNote: async () => "x",
      generateNoteWithMetadata: async () => ({ text: "1. MOTIVELE PREZENTĂRII\nTuse", model: "anthropic.claude-sonnet-5", fallbackUsed: true }),
    });
    const res = await generateNote(
      makeRequest("/api/generate-note", { json: { transcript: "Pacient: tuse de trei zile, fără febră." }, cookie: await sessionCookieFor(world.a.user) }),
    );
    const body = await res.json();
    expect(body.warnings.find((w: { code: string }) => w.code === "FALLBACK_MODEL_USED").message).toContain("anthropic.claude-sonnet-5");
  });
});
