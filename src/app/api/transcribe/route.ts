import { getEnv } from "@/config/env";
import { AppError, isAppError } from "@/lib/api/errors";
import { corsPreflight, errorResponse, withApi } from "@/lib/api/handler";
import { getTranscriptionSemaphore } from "@/lib/security/concurrency";
import { normalizeMime, readBodyWithLimit, validateAudioPayload, wipeBuffer } from "@/lib/validation/audio";
import { transcribeAndRedact } from "@/services/consultation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Must exceed AZURE_SPEECH_TIMEOUT_MS (overall deadline incl. retries, default 600 s).
export const maxDuration = 800;

/**
 * POST /api/transcribe
 * Body: raw audio bytes (Content-Type: audio/webm | audio/ogg | audio/mp4 | audio/wav | audio/mpeg).
 * Optional header X-Audio-Duration: seconds (operational metadata only).
 *
 * Response: NDJSON stream of progress events so the UI shows real stages:
 *   {"stage":"received"} → {"stage":"transcribing"} → {"stage":"redacting"} → {"stage":"done","result":{...}}
 *   or {"stage":"error","error":{"code","message"}}
 *
 * The audio is held only in process memory for the duration of the request
 * and overwritten after the provider call; the application never writes it to
 * disk. This route is excluded from proxy.ts so Next.js does not clone/buffer
 * the body (the proxy body clone is capped at 10 MB and truncates silently).
 */
export const POST = withApi(
  {
    auth: true,
    rateLimit: () => ({ name: "transcribe", limit: getEnv().RATE_LIMIT_TRANSCRIBE_PER_HOUR, windowMs: 60 * 60_000, by: "user" }),
  },
  async ({ request, auth }) => {
    const env = getEnv();
    const mime = normalizeMime(request.headers.get("content-type"));
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > env.MAX_AUDIO_BYTES) {
      throw new AppError("PAYLOAD_TOO_LARGE", "Înregistrarea depășește dimensiunea maximă permisă.");
    }
    const durationHeader = Number(request.headers.get("x-audio-duration"));
    const audioSeconds = Number.isFinite(durationHeader) && durationHeader >= 0 && durationHeader < 6 * 3600 ? durationHeader : null;

    const release = getTranscriptionSemaphore(() => getEnv().MAX_CONCURRENT_TRANSCRIPTIONS).tryAcquire();
    if (!release) {
      return errorResponse(new AppError("RATE_LIMITED", "Serverul procesează deja numărul maxim de consultații. Reîncercați în câteva momente."), {
        "Retry-After": "30",
      });
    }

    let audio: Uint8Array | null;
    try {
      audio = await readBodyWithLimit(request.body, env.MAX_AUDIO_BYTES);
      if (declaredLength > 0 && audio.byteLength !== declaredLength) {
        wipeBuffer(audio);
        throw new AppError("VALIDATION_ERROR", "Încărcarea audio este incompletă. Reîncercați.");
      }
      try {
        validateAudioPayload(audio, mime, env.MAX_AUDIO_BYTES);
      } catch (e) {
        wipeBuffer(audio);
        throw e;
      }
    } catch (e) {
      release();
      throw e;
    }

    const encoder = new TextEncoder();
    const ctx = auth!;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        send({ stage: "received" });
        try {
          const result = await transcribeAndRedact({
            auth: ctx,
            audio: audio!,
            mimeType: mime,
            audioSeconds,
            onStage: (stage) => send({ stage }),
          });
          send({ stage: "done", result });
        } catch (err) {
          const safe = isAppError(err) ? err : new AppError("INTERNAL_ERROR", "Transcrierea nu a reușit.");
          send({ stage: "error", error: { code: safe.code, message: safe.message } });
        } finally {
          wipeBuffer(audio);
          audio = null;
          release();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Accel-Buffering": "no",
      },
    });
  },
);

export const OPTIONS = corsPreflight;
