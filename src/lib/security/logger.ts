/**
 * Privacy-safe structured logger.
 *
 * Only an explicit allow-list of operational fields can be logged. There is no
 * way to pass free text, request bodies, transcripts, notes or audio through
 * this API – the type system and the runtime filter both enforce it.
 */
export interface SafeLogFields {
  event: string;
  route?: string;
  method?: string;
  status?: number;
  code?: string;
  durationMs?: number;
  bytes?: number;
  provider?: string;
  /** Opaque identifiers only (UUIDs). */
  organizationId?: string;
  userId?: string;
}

const ALLOWED_KEYS = new Set<keyof SafeLogFields>([
  "event", "route", "method", "status", "code", "durationMs", "bytes", "provider", "organizationId", "userId",
]);

function sanitize(fields: SafeLogFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_KEYS.has(k as keyof SafeLogFields)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 120).replace(/[^\w.:/@-]/g, "_");
  }
  return out;
}

function emit(level: "info" | "warn" | "error", fields: SafeLogFields): void {
  if (process.env.NODE_ENV === "test" && !process.env.SCRIBMED_LOG_IN_TESTS) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...sanitize(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const safeLog = {
  info: (f: SafeLogFields) => emit("info", f),
  warn: (f: SafeLogFields) => emit("warn", f),
  error: (f: SafeLogFields) => emit("error", f),
  /** Exposed for tests. */
  sanitize,
};
