/** Browser capability helpers for audio capture (pure – testable). */

export const PREFERRED_AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

/** ~32 kbps Opus: a 30-minute consultation ≈ 7.2 MB. */
export const AUDIO_BITS_PER_SECOND = 32_000;
/** Safety limit for a single consultation recording. */
export const MAX_RECORDING_SECONDS = 45 * 60;

export function pickSupportedMimeType(isSupported: (mime: string) => boolean): string | null {
  for (const m of PREFERRED_AUDIO_MIME_TYPES) {
    try {
      if (isSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export type RecorderErrorKind = "unsupported" | "permission_denied" | "no_device" | "device_busy" | "insecure_context" | "unknown";

export const RECORDER_ERROR_MESSAGES: Record<RecorderErrorKind, string> = {
  unsupported: "Browserul nu permite înregistrarea audio. Folosiți o versiune recentă de Chrome, Edge, Firefox sau Safari.",
  permission_denied: "Accesul la microfon a fost refuzat. Permiteți accesul din setările browserului și încercați din nou.",
  no_device: "Nu a fost detectat niciun microfon. Conectați un microfon și încercați din nou.",
  device_busy: "Microfonul este folosit de altă aplicație. Închideți aplicația respectivă și încercați din nou.",
  insecure_context: "Înregistrarea audio necesită o conexiune securizată (HTTPS).",
  unknown: "Microfonul nu a putut fi pornit. Încercați din nou.",
};

export function classifyGetUserMediaError(err: unknown): RecorderErrorKind {
  const name = (err as { name?: string })?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no_device";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "device_busy";
    default:
      return "unknown";
  }
}

export function detectRecordingSupport(win: (Window & typeof globalThis) | undefined): RecorderErrorKind | null {
  if (!win) return "unsupported";
  if (win.isSecureContext === false) return "insecure_context";
  if (!win.navigator?.mediaDevices?.getUserMedia || typeof win.MediaRecorder === "undefined") return "unsupported";
  return null;
}

/** Strips codec parameters: "audio/webm;codecs=opus" → "audio/webm". */
export function containerMime(mime: string): string {
  return mime.split(";")[0]?.trim() ?? mime;
}
