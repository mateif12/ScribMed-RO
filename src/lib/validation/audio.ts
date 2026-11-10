import { AppError } from "@/lib/api/errors";

/** MIME types accepted by /api/transcribe (codec parameters are stripped). */
export const ACCEPTED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
] as const;
export type AcceptedAudioMime = (typeof ACCEPTED_AUDIO_MIME_TYPES)[number];

export const MIN_AUDIO_BYTES = 1024;

export function normalizeMime(contentType: string | null): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAcceptedAudioMime(mime: string): mime is AcceptedAudioMime {
  return (ACCEPTED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

/** Magic-byte sniffing so that the declared MIME type cannot simply be spoofed. */
export function sniffAudioContainer(bytes: Uint8Array): AcceptedAudioMime | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45)
    return "audio/wav";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "audio/mp4";
  if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

function family(mime: string): string {
  return mime === "audio/x-wav" ? "audio/wav" : mime;
}

/**
 * Validates declared MIME type, size bounds and container signature.
 * Throws AppError with a safe Romanian message.
 */
export function validateAudioPayload(bytes: Uint8Array, declaredMime: string, maxBytes: number): AcceptedAudioMime {
  if (!isAcceptedAudioMime(declaredMime)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Formatul audio nu este acceptat.");
  }
  if (bytes.byteLength < MIN_AUDIO_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Înregistrarea este prea scurtă sau goală.");
  }
  if (bytes.byteLength > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Înregistrarea depășește dimensiunea maximă permisă.");
  }
  const sniffed = sniffAudioContainer(bytes);
  if (!sniffed || family(sniffed) !== family(declaredMime)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Conținutul fișierului nu corespunde unui format audio acceptat.");
  }
  return declaredMime;
}

/**
 * Reads a request body stream into memory while enforcing a hard byte limit.
 * Aborts as soon as the limit is exceeded (no unbounded buffering).
 */
export async function readBodyWithLimit(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) throw new AppError("VALIDATION_ERROR", "Cererea nu conține date audio.");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AppError("PAYLOAD_TOO_LARGE", "Înregistrarea depășește dimensiunea maximă permisă.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
    c.fill(0); // best-effort overwrite of intermediate chunk buffers
  }
  chunks.length = 0;
  return out;
}

/**
 * Best-effort wipe of an audio buffer once processing is complete.
 * NOTE: this overwrites *this* buffer only. Copies made by the runtime,
 * the HTTP stack or the OS are outside our control; this is not a forensic
 * deletion guarantee.
 */
export function wipeBuffer(buf: Uint8Array | null | undefined): void {
  if (buf) buf.fill(0);
}
