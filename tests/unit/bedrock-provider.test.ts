import { describe, expect, it, vi } from "vitest";
import { BedrockClaudeProvider, type MessagesClient } from "@/lib/ai/bedrock-claude-provider";
import { NoteProviderError } from "@/lib/ai/types";

const config = { region: "eu-central-1", modelId: "anthropic.claude-sonnet-5-5", maxTokens: 8000, timeoutMs: 60_000 };

function clientReturning(...responses: Array<{ stop_reason: string | null; content: Array<{ type: string; text?: string }> }>) {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

describe("BedrockClaudeProvider", () => {
  it("sends the strict system prompt, wrapped transcript and configured model; no temperature", async () => {
    const { client, create } = clientReturning({ stop_reason: "end_turn", content: [{ type: "text", text: "1. MOTIVELE PREZENTĂRII\nTuse" }] });
    const p = new BedrockClaudeProvider(config, client);
    const out = await p.generateNote("Pacient: tuse", "medicina_generala");
    expect(out).toBe("1. MOTIVELE PREZENTĂRII\nTuse");
    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.model).toBe("anthropic.claude-sonnet-5-5");
    expect(body.max_tokens).toBe(8000);
    expect(body).not.toHaveProperty("temperature");
    expect(String(body.system)).toContain("You are a Romanian medical documentation assistant.");
    expect(JSON.stringify(body.messages)).toContain("<transcriere>");
    expect(body).not.toHaveProperty("output_config");
  });

  it("passes effort when configured", async () => {
    const { client, create } = clientReturning({ stop_reason: "end_turn", content: [{ type: "text", text: "x" }] });
    await new BedrockClaudeProvider({ ...config, effort: "medium" }, client).generateNote("t");
    expect((create.mock.calls[0]![0] as Record<string, unknown>).output_config).toEqual({ effort: "medium" });
  });

  it("throws a refusal error when the model refuses and no fallback is configured", async () => {
    const { client } = clientReturning({ stop_reason: "refusal", content: [] });
    const err = await new BedrockClaudeProvider(config, client).generateNote("t").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoteProviderError);
    expect((err as NoteProviderError).kind).toBe("refusal");
  });

  it("retries once on the fallback model after a refusal", async () => {
    const { client, create } = clientReturning(
      { stop_reason: "refusal", content: [] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
    );
    const out = await new BedrockClaudeProvider({ ...config, fallbackModelId: "anthropic.claude-sonnet-5" }, client).generateNote("t");
    expect(out).toBe("ok");
    expect((create.mock.calls[1]![0] as Record<string, unknown>).model).toBe("anthropic.claude-sonnet-5");
  });

  it("rejects truncated output", async () => {
    const { client } = clientReturning({ stop_reason: "max_tokens", content: [{ type: "text", text: "1. MOTIV" }] });
    await expect(new BedrockClaudeProvider(config, client).generateNote("t")).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("wraps SDK errors without leaking their message", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("prompt: Pacient X ..."), { status: 503 }));
    const p = new BedrockClaudeProvider(config, { messages: { create } } as unknown as MessagesClient);
    const err = (await p.generateNote("t").catch((e: unknown) => e)) as NoteProviderError;
    expect(err.kind).toBe("unavailable");
    expect(err.message).not.toContain("Pacient");
    expect(err.message).toContain("503");
  });
});
