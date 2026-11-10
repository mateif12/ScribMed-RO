import "server-only";
import { getEnv } from "@/config/env";
import { BedrockClaudeProvider } from "./bedrock-claude-provider";
import { MockClinicalNoteProvider } from "./mock-note-provider";
import type { ClinicalNoteProvider } from "./types";

let instance: ClinicalNoteProvider | null = null;

export function getClinicalNoteProvider(): ClinicalNoteProvider {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.NOTE_PROVIDER === "bedrock"
      ? new BedrockClaudeProvider({
          region: env.BEDROCK_REGION,
          modelId: env.BEDROCK_MODEL_ID,
          fallbackModelId: env.BEDROCK_FALLBACK_MODEL_ID,
          maxTokens: env.BEDROCK_MAX_TOKENS,
          effort: env.BEDROCK_EFFORT,
          timeoutMs: env.BEDROCK_TIMEOUT_MS,
        })
      : new MockClinicalNoteProvider(env.MOCK_PROVIDER_LATENCY_MS);
  return instance;
}

export function setClinicalNoteProvider(p: ClinicalNoteProvider | null): void {
  instance = p;
}

export type { ClinicalNoteProvider } from "./types";
