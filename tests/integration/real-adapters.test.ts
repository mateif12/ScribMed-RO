/**
 * Exercises the REAL provider code paths (Anthropic Bedrock SDK with SigV4,
 * Node fetch multipart for Azure) against local HTTP servers. No credentials,
 * synthetic data only.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BedrockClaudeProvider } from "@/lib/ai/bedrock-claude-provider";
import { NoteProviderError } from "@/lib/ai/types";
import { AzureSpeechProvider } from "@/lib/speech/azure-speech-provider";

interface Captured {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

let server: http.Server;
let base = "";
let captured: Captured[] = [];
let respond: (c: Captured, res: http.ServerResponse) => void = (_c, res) => res.end();

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const ch of req) chunks.push(ch as Buffer);
    const c = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) };
    captured.push(c);
    respond(c, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.AWS_ACCESS_KEY_ID = "AKIATESTTESTTESTTEST";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret-not-real";
});
afterEach(() => {
  captured = [];
});
afterAll(async () => {
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  await new Promise<void>((r) => server.close(() => r()));
});

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

describe("Bedrock: real AnthropicBedrockMantle client", () => {
  const provider = () =>
    new BedrockClaudeProvider({
      region: "eu-central-1",
      modelId: "anthropic.claude-sonnet-5-5",
      maxTokens: 16000,
      timeoutMs: 10_000,
      maxRetries: 0,
      endpointUrl: `${base}/anthropic`,
    });

  it("sends a SigV4-signed Messages API request for bedrock-mantle in eu-central-1", async () => {
    respond = (_c, res) =>
      json(res, 200, {
        id: "m", type: "message", role: "assistant", model: "anthropic.claude-sonnet-5-5", stop_reason: "end_turn",
        content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: "1. MOTIVELE PREZENTĂRII\nTuse" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const text = await provider().generateNote("Pacient: [NUME_ELIMINAT] acuză tuse.", "medicina_generala");
    expect(text).toBe("1. MOTIVELE PREZENTĂRII\nTuse");
    const [req] = captured;
    expect(req!.method).toBe("POST");
    expect(req!.url).toBe("/anthropic/v1/messages");
    expect(req!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIATESTTESTTESTTEST\/\d{8}\/eu-central-1\/bedrock-mantle\/aws4_request/);
    expect(req!.headers["x-amz-date"]).toBeTruthy();
    const body = JSON.parse(req!.body.toString("utf8"));
    expect(body.model).toBe("anthropic.claude-sonnet-5-5");
    expect(body.max_tokens).toBe(16000);
    expect(body).not.toHaveProperty("temperature");
    expect(body.messages[0].content).toContain("<transcriere>");
  });

  it("maps a real 403 AccessDenied response to access_denied without leaking the body", async () => {
    respond = (_c, res) => json(res, 403, { message: "User arn:aws:iam::123:role/x is not authorized to perform bedrock-mantle:CreateInference" });
    const err = (await provider().generateNote("t").catch((e: unknown) => e)) as NoteProviderError;
    expect(err).toBeInstanceOf(NoteProviderError);
    expect(err.kind).toBe("access_denied");
    expect(err.message).not.toContain("arn:aws");
  });

  it("maps a real 404 (unknown model / not enabled in region) to config", async () => {
    respond = (_c, res) => json(res, 404, { type: "error", error: { type: "not_found_error", message: "model" } });
    await expect(provider().generateNote("t")).rejects.toMatchObject({ kind: "config", status: 404 });
  });
});

describe("Azure: real fetch + multipart against the verified contract", () => {
  const provider = (extra: Partial<ConstructorParameters<typeof AzureSpeechProvider>[0]> = {}) =>
    new AzureSpeechProvider({ apiKey: "k", region: "westeurope", endpoint: base, locale: "ro-RO", apiVersion: "2024-11-15", timeoutMs: 10_000, maxRetries: 0, ...extra });

  it("sends multipart audio + definition parts that a multipart parser accepts", async () => {
    respond = (_c, res) => json(res, 200, { durationMilliseconds: 1000, combinedPhrases: [{ text: "Bună ziua." }], phrases: [] });
    const audio = new Uint8Array(4096);
    audio.set([0x1a, 0x45, 0xdf, 0xa3]);
    expect(await provider().transcribe(audio, { mimeType: "audio/webm" })).toBe("Bună ziua.");
    const req = captured[0]!;
    expect(req.url).toBe("/speechtotext/transcriptions:transcribe?api-version=2024-11-15");
    expect(req.headers["ocp-apim-subscription-key"]).toBe("k");
    const form = await new Request("http://x/", {
      method: "POST",
      headers: { "content-type": String(req.headers["content-type"]) },
      body: new Uint8Array(req.body),
    }).formData();
    const file = form.get("audio") as File;
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(4096);
    expect(JSON.parse(String(form.get("definition")))).toEqual({ locales: ["ro-RO"], profanityFilterMode: "None" });
  });

  it("requests diarization with the documented property names", async () => {
    respond = (_c, res) => json(res, 200, { durationMilliseconds: 1, combinedPhrases: [], phrases: [{ text: "A", speaker: 1, offsetMilliseconds: 0 }] });
    await provider({ diarization: true }).transcribe(new Uint8Array(2048), { mimeType: "audio/ogg" });
    const form = await new Request("http://x/", { method: "POST", headers: { "content-type": String(captured[0]!.headers["content-type"]) }, body: new Uint8Array(captured[0]!.body) }).formData();
    expect(JSON.parse(String(form.get("definition"))).diarization).toEqual({ enabled: true, maxSpeakers: 2 });
  });
});
