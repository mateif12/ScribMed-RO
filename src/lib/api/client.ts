/**
 * Browser-side API client. Every mutating request carries the CSRF header.
 * Responses with clinical content are never cached or stored by this client.
 */
export const CSRF_HEADER_NAME = "x-scribmed-request";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const GENERIC = "A apărut o eroare de rețea. Verificați conexiunea și încercați din nou.";

export async function apiFetch<T>(path: string, init: { method?: string; json?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
      headers: {
        Accept: "application/json",
        [CSRF_HEADER_NAME]: "1",
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiClientError(GENERIC, "NETWORK_ERROR", 0);
  }
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    throw new ApiClientError(data?.error?.message ?? GENERIC, data?.error?.code ?? "HTTP_ERROR", res.status);
  }
  return data as T;
}

export interface TranscriptionResponse {
  transcript: string;
  redactions: Record<string, number>;
  redactionTotal: number;
  provider: string;
}

export type ServerStage = "received" | "transcribing" | "redacting";

/** Splits complete NDJSON lines out of a growing buffer. Exported for tests. */
export function parseNdjsonChunk(buffer: string): { events: unknown[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: unknown[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* ignore malformed line */
    }
  }
  return { events, rest };
}

/**
 * Uploads the recorded audio in a single request (no streaming during
 * recording) and follows the server's NDJSON progress events.
 * Uses XMLHttpRequest because fetch() cannot report upload progress.
 */
export function uploadForTranscription(
  audio: Blob,
  opts: {
    durationSeconds: number;
    onUploadProgress?: (pct: number) => void;
    onStage?: (stage: ServerStage) => void;
    signal?: AbortSignal;
  },
): Promise<TranscriptionResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let consumed = 0;
    let buffer = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const handleEvents = () => {
      const text = xhr.responseText;
      buffer += text.slice(consumed);
      consumed = text.length;
      const { events, rest } = parseNdjsonChunk(buffer);
      buffer = rest;
      for (const ev of events as Array<{ stage: string; result?: TranscriptionResponse; error?: { code: string; message: string } }>) {
        if (ev.stage === "done" && ev.result) finish(() => resolve(ev.result!));
        else if (ev.stage === "error") finish(() => reject(new ApiClientError(ev.error?.message ?? GENERIC, ev.error?.code ?? "ERROR", 200)));
        else if (ev.stage === "received" || ev.stage === "transcribing" || ev.stage === "redacting") opts.onStage?.(ev.stage);
      }
    };
    const onAbort = () => xhr.abort();

    xhr.open("POST", "/api/transcribe");
    xhr.withCredentials = false; // same-origin: cookies are sent automatically
    xhr.setRequestHeader("Content-Type", audio.type.split(";")[0] || "audio/webm");
    xhr.setRequestHeader("X-Audio-Duration", String(Math.round(opts.durationSeconds)));
    xhr.setRequestHeader(CSRF_HEADER_NAME, "1");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onUploadProgress?.((e.loaded / e.total) * 100);
    };
    xhr.onprogress = () => {
      if (xhr.status === 200) handleEvents();
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        handleEvents();
        if (buffer.trim()) {
          buffer += "\n";
          handleEvents();
        }
        finish(() => reject(new ApiClientError("Răspuns incomplet de la server.", "INCOMPLETE", 200)));
      } else {
        let message = GENERIC;
        let code = "HTTP_ERROR";
        try {
          const data = JSON.parse(xhr.responseText) as { error?: { code: string; message: string } };
          message = data.error?.message ?? message;
          code = data.error?.code ?? code;
        } catch {
          /* ignore */
        }
        finish(() => reject(new ApiClientError(message, code, xhr.status)));
      }
    };
    xhr.onerror = () => finish(() => reject(new ApiClientError(GENERIC, "NETWORK_ERROR", 0)));
    xhr.onabort = () => finish(() => reject(new ApiClientError("Operațiune anulată.", "ABORTED", 0)));
    opts.signal?.addEventListener("abort", onAbort);
    xhr.send(audio);
  });
}
