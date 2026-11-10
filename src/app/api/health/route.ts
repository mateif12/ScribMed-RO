import { getEnv } from "@/config/env";
import { jsonResponse } from "@/lib/api/handler";
import { getRepository } from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness/readiness probe. Exposes provider modes only, never configuration values. */
export async function GET() {
  const env = getEnv();
  let database: "ok" | "error" = "ok";
  try {
    const repo = await getRepository();
    await repo.findUserByEmail("healthcheck@invalid.local");
  } catch {
    database = "error";
  }
  return jsonResponse(
    {
      status: database === "ok" ? "ok" : "degraded",
      time: new Date().toISOString(),
      providers: { auth: env.AUTH_PROVIDER, database: env.DATABASE_PROVIDER, speech: env.SPEECH_PROVIDER, notes: env.NOTE_PROVIDER },
      checks: { database },
    },
    { status: database === "ok" ? 200 : 503 },
  );
}
