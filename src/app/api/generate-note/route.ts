import { getEnv } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { corsPreflight, jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { generateNoteSchema, zodMessage } from "@/lib/validation/schemas";
import { generateClinicalNote } from "@/services/consultation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Must exceed BEDROCK_TIMEOUT_MS × (BEDROCK_MAX_RETRIES + 1) = 180 s × 2 = 360 s with defaults.
export const maxDuration = 420;

/**
 * Generates a structured note from a transcript. The transcript is re-redacted
 * server-side before reaching the LLM. Nothing is stored; response is no-store.
 */
export const POST = withApi(
  {
    auth: true,
    rateLimit: () => ({ name: "generate", limit: getEnv().RATE_LIMIT_GENERATE_PER_HOUR, windowMs: 60 * 60_000, by: "user" }),
  },
  async ({ request, auth }) => {
    const parsed = generateNoteSchema.safeParse(await readJson(request, 512 * 1024));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    const result = await generateClinicalNote({ auth: auth!, transcript: parsed.data.transcript, specialty: parsed.data.specialty });
    return jsonResponse(result);
  },
);

export const OPTIONS = corsPreflight;
