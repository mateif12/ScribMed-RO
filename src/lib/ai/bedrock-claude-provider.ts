import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { SpecialtyId } from "@/types/domain";
import { buildSystemPrompt, buildUserMessage } from "./system-prompt";
import { NoteProviderError, type ClinicalNoteProvider } from "./types";

export interface BedrockClaudeConfig {
  region: string;
  modelId: string;
  /** Optional model used once if the primary model returns stop_reason "refusal". */
  fallbackModelId?: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  timeoutMs: number;
}

/** Minimal surface of the SDK client we use – enables injection in tests. */
export interface MessagesClient {
  messages: {
    create(body: Record<string, unknown>, options?: { timeout?: number }): Promise<{
      stop_reason: string | null;
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

/**
 * Claude on Amazon Bedrock via the Anthropic Bedrock SDK (Messages-API
 * "Mantle" client). Credentials come from the standard AWS provider chain
 * (IAM role, AWS_PROFILE, or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) –
 * never from the browser.
 *
 * Sampling: current Claude models and API versions reject `temperature`
 * (HTTP 400), so it is intentionally NOT sent. Output stability is enforced by
 * the strict system prompt plus server-side structure normalisation and
 * grounding checks instead.
 *
 * Nothing in this class logs prompts, transcripts or responses.
 */
export class BedrockClaudeProvider implements ClinicalNoteProvider {
  readonly name = "bedrock";
  private readonly client: MessagesClient;

  constructor(
    private readonly config: BedrockClaudeConfig,
    client?: MessagesClient,
  ) {
    this.client =
      client ??
      (new AnthropicBedrockMantle({
        awsRegion: config.region,
        timeout: config.timeoutMs,
        maxRetries: 2,
      }) as unknown as MessagesClient);
  }

  async generateNote(transcript: string, specialty?: SpecialtyId): Promise<string> {
    const body = (model: string): Record<string, unknown> => ({
      model,
      max_tokens: this.config.maxTokens,
      system: buildSystemPrompt(specialty),
      messages: [{ role: "user", content: buildUserMessage(transcript) }],
      ...(this.config.effort ? { output_config: { effort: this.config.effort } } : {}),
    });

    let response;
    try {
      response = await this.client.messages.create(body(this.config.modelId), { timeout: this.config.timeoutMs });
      if (response.stop_reason === "refusal" && this.config.fallbackModelId) {
        response = await this.client.messages.create(body(this.config.fallbackModelId), { timeout: this.config.timeoutMs });
      }
    } catch (err) {
      // Error objects from the SDK may echo request metadata; we never forward them.
      const status = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) : null;
      throw new NoteProviderError(
        status ? `Serviciul AI a răspuns cu statusul ${status}` : "Serviciul AI nu poate fi contactat",
        "unavailable",
      );
    }

    if (response.stop_reason === "refusal") {
      throw new NoteProviderError("Modelul a refuzat generarea fișei pentru această transcriere.", "refusal");
    }
    if (response.stop_reason === "max_tokens") {
      throw new NoteProviderError("Fișa generată a fost trunchiată (limită de tokeni).", "invalid_output");
    }
    const text = response.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
    if (!text) throw new NoteProviderError("Modelul nu a returnat conținut.", "invalid_output");
    return text;
  }
}
