import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { SpecialtyId } from "@/types/domain";
import { buildSystemPrompt, buildUserMessage } from "./system-prompt";
import { NoteProviderError, type ClinicalNoteProvider, type NoteGeneration, type NoteProviderErrorKind } from "./types";

export interface BedrockClaudeConfig {
  region: string;
  modelId: string;
  /** Optional model used once if the primary model returns stop_reason "refusal". */
  fallbackModelId?: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  /** Per-attempt timeout. Wall-clock worst case ≈ timeoutMs × (maxRetries + 1). */
  timeoutMs: number;
  /** SDK retries on 408/409/429/5xx and connection errors. Default 1. */
  maxRetries?: number;
  /** Optional endpoint override, e.g. a VPC endpoint. Default: https://bedrock-mantle.{region}.api.aws/anthropic */
  endpointUrl?: string;
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
 * Claude in Amazon Bedrock via the Anthropic Bedrock SDK (`AnthropicBedrockMantle`).
 *
 * Verified (Anthropic "Claude in Amazon Bedrock" documentation + offline SDK probe):
 *   - endpoint https://bedrock-mantle.{region}.api.aws/anthropic/v1/messages, Messages API body shape;
 *   - requests are SigV4-signed for service `bedrock-mantle` with credentials from the
 *     standard AWS chain (IAM role / AWS_PROFILE / AWS_* variables) – never from the browser;
 *   - IAM action `bedrock-mantle:CreateInference`; model IDs carry the `anthropic.` prefix
 *     (Claude Sonnet 5.5 = `anthropic.claude-sonnet-5-5`);
 *   - eu-central-1 offers "Global" and "EU" routing but is NOT an "In-region only" region:
 *     selecting eu-central-1 does not by itself guarantee processing in Frankfurt or in the EU.
 *
 * The model ID is never defaulted or substituted: it comes from BEDROCK_MODEL_ID.
 * A fallback model is used only if BEDROCK_FALLBACK_MODEL_ID is set, only after a
 * `refusal`, and the switch is reported to the caller (never silent).
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
        maxRetries: config.maxRetries ?? 1,
        ...(config.endpointUrl ? { baseURL: config.endpointUrl } : {}),
      }) as unknown as MessagesClient);
  }

  async generateNote(transcript: string, specialty?: SpecialtyId): Promise<string> {
    return (await this.generateNoteWithMetadata(transcript, specialty)).text;
  }

  async generateNoteWithMetadata(transcript: string, specialty?: SpecialtyId): Promise<NoteGeneration> {
    const body = (model: string): Record<string, unknown> => ({
      model,
      max_tokens: this.config.maxTokens,
      system: buildSystemPrompt(specialty),
      messages: [{ role: "user", content: buildUserMessage(transcript) }],
      ...(this.config.effort ? { output_config: { effort: this.config.effort } } : {}),
    });

    let response;
    let model = this.config.modelId;
    try {
      response = await this.client.messages.create(body(model), { timeout: this.config.timeoutMs });
      if (response.stop_reason === "refusal" && this.config.fallbackModelId) {
        model = this.config.fallbackModelId;
        response = await this.client.messages.create(body(model), { timeout: this.config.timeoutMs });
      }
    } catch (err) {
      // SDK error objects may echo request metadata; only the HTTP status / class name is used.
      throw mapBedrockError(err);
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
    return { text, model, fallbackUsed: model !== this.config.modelId };
  }
}

const BEDROCK_ERROR_MESSAGES: Record<NoteProviderErrorKind, string> = {
  access_denied: "Accesul la modelul AI nu este autorizat (IAM sau model access în Bedrock). Contactați administratorul.",
  config: "Modelul AI configurat nu este disponibil în această regiune sau cont. Contactați administratorul.",
  bad_request: "Cererea către serviciul AI a fost respinsă (configurație sau dimensiune incompatibilă). Contactați administratorul.",
  rate_limited: "Serviciul AI este suprasolicitat. Reîncercați peste câteva momente.",
  timeout: "Generarea fișei a durat prea mult și a fost oprită. Reîncercați.",
  unavailable: "Serviciul AI este temporar indisponibil. Reîncercați.",
  invalid_output: "Serviciul AI a returnat un răspuns invalid.",
  refusal: "Modelul a refuzat generarea fișei pentru această transcriere.",
};

/** Maps SDK errors to content-free provider errors (status code + class name only). */
export function mapBedrockError(err: unknown): NoteProviderError {
  const status = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) : null;
  const name = (err as { name?: string })?.name ?? "";
  let kind: NoteProviderErrorKind;
  if (name === "APIConnectionTimeoutError" || status === 408) kind = "timeout";
  else if (status === 401 || status === 403) kind = "access_denied";
  else if (status === 404) kind = "config";
  else if (status === 400 || status === 413 || status === 422) kind = "bad_request";
  else if (status === 429) kind = "rate_limited";
  else kind = "unavailable";
  return new NoteProviderError(BEDROCK_ERROR_MESSAGES[kind], kind, Number.isFinite(status) ? status : null);
}
