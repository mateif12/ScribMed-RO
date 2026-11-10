import "server-only";
import { z } from "zod";

/**
 * Server-side configuration. Validated once at first access.
 * NEVER import this module from client components – it contains secrets.
 */
const boolish = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    ALLOWED_ORIGINS: z.string().optional(),

    SESSION_SECRET: z.string().min(32).optional(),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(8),

    AUTH_PROVIDER: z.enum(["mock", "cognito"]).default("mock"),
    ALLOW_MOCK_AUTH_IN_PRODUCTION: boolish,
    COGNITO_REGION: z.string().default("eu-central-1"),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    COGNITO_CLIENT_SECRET: z.string().optional(),

    DATABASE_PROVIDER: z.enum(["memory", "postgres"]).default("memory"),
    DATABASE_URL: z.string().optional(),
    DATABASE_SSL: boolish,

    SPEECH_PROVIDER: z.enum(["mock", "azure"]).default("mock"),
    AZURE_SPEECH_KEY: z.string().optional(),
    // Interpolated into a hostname – restrict to Azure region syntax.
    AZURE_SPEECH_REGION: z.string().regex(/^[a-z0-9]+$/, "regiune Azure invalidă").default("westeurope"),
    AZURE_SPEECH_ENDPOINT: z.string().url().optional(),
    AZURE_SPEECH_LOCALE: z.string().default("ro-RO"),
    AZURE_SPEECH_API_VERSION: z.string().default("2024-11-15"),
    AZURE_SPEECH_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(600_000),
    AZURE_SPEECH_DIARIZATION: boolish,
    /** Verified contract: Fast Transcription accepts audio < 2 h (api-version 2024-11-15). */
    AZURE_SPEECH_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),

    NOTE_PROVIDER: z.enum(["mock", "bedrock"]).default("mock"),
    BEDROCK_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, "regiune AWS invalidă").default("eu-central-1"),
    // No default: the operator must set the exact model / inference-profile ID enabled in their account.
    BEDROCK_MODEL_ID: z.string().regex(/^[A-Za-z0-9.:/_-]+$/, "ID model invalid").optional(),
    /** Optional endpoint override (VPC endpoint, or a local contract stub in tests). */
    BEDROCK_ENDPOINT_URL: z.string().url().optional(),
    BEDROCK_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
    BEDROCK_FALLBACK_MODEL_ID: z.string().optional(),
    BEDROCK_MAX_TOKENS: z.coerce.number().int().min(1000).max(64000).default(16000),
    BEDROCK_EFFORT: z.enum(["low", "medium", "high"]).optional(),
    BEDROCK_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(180_000),

    NER_PROVIDER: z.enum(["heuristic", "none"]).default("heuristic"),

    MAX_AUDIO_BYTES: z.coerce.number().int().min(1024).default(40 * 1024 * 1024),
    MAX_TRANSCRIPT_CHARS: z.coerce.number().int().min(1000).default(200_000),
    MOCK_PROVIDER_LATENCY_MS: z.coerce.number().int().min(0).default(600),
    ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: boolish,
    /** Per-instance cap on simultaneous in-memory audio uploads (memory protection). */
    MAX_CONCURRENT_TRANSCRIPTIONS: z.coerce.number().int().min(1).max(100).default(4),

    RATE_LIMIT_TRANSCRIBE_PER_HOUR: z.coerce.number().int().min(1).default(30),
    RATE_LIMIT_GENERATE_PER_HOUR: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_AUTH_PER_15_MIN: z.coerce.number().int().min(1).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.SESSION_SECRET) {
        ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "obligatoriu în producție" });
      }
      if (env.AUTH_PROVIDER === "mock" && !env.ALLOW_MOCK_AUTH_IN_PRODUCTION) {
        ctx.addIssue({ code: "custom", path: ["AUTH_PROVIDER"], message: "mock auth este interzis în producție" });
      }
      if ((env.SPEECH_PROVIDER === "mock" || env.NOTE_PROVIDER === "mock") && !env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION) {
        ctx.addIssue({ code: "custom", path: ["NOTE_PROVIDER"], message: "providerii mock sunt interziși în producție (generează conținut sintetic)" });
      }
      for (const key of ["AZURE_SPEECH_ENDPOINT", "BEDROCK_ENDPOINT_URL"] as const) {
        const v = env[key];
        if (v && !v.startsWith("https://")) ctx.addIssue({ code: "custom", path: [key], message: "trebuie să folosească https în producție" });
      }
    }
    if (env.AUTH_PROVIDER === "cognito" && (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID)) {
      ctx.addIssue({ code: "custom", path: ["COGNITO_USER_POOL_ID"], message: "necesar pentru AUTH_PROVIDER=cognito" });
    }
    if (env.DATABASE_PROVIDER === "postgres" && !env.DATABASE_URL) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "necesar pentru DATABASE_PROVIDER=postgres" });
    }
    if (env.SPEECH_PROVIDER === "azure" && !env.AZURE_SPEECH_KEY) {
      ctx.addIssue({ code: "custom", path: ["AZURE_SPEECH_KEY"], message: "necesar pentru SPEECH_PROVIDER=azure" });
    }
    if (env.NOTE_PROVIDER === "bedrock" && !env.BEDROCK_MODEL_ID) {
      ctx.addIssue({ code: "custom", path: ["BEDROCK_MODEL_ID"], message: "necesar pentru NOTE_PROVIDER=bedrock (nu se presupune un model implicit)" });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  // Treat empty values (e.g. `SESSION_SECRET=` copied from .env.example) as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    // Only variable names and messages are printed – never values.
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configurație invalidă: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = null;
}

const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-0123456789";

export function getSessionSecret(): string {
  const env = getEnv();
  return env.SESSION_SECRET ?? DEV_SESSION_SECRET;
}

export function getAllowedOrigins(): string[] {
  const env = getEnv();
  const extra = env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
  return Array.from(new Set([new URL(env.APP_URL).origin, ...extra]));
}
