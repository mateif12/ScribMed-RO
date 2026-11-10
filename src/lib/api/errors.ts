/**
 * Application error with a safe, user-facing Romanian message.
 * `message` must NEVER contain clinical content, transcripts or identifiers.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CSRF_REJECTED"
  | "PROVIDER_ERROR"
  | "PROVIDER_REFUSAL"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 402,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CSRF_REJECTED: 403,
  PROVIDER_ERROR: 502,
  PROVIDER_REFUSAL: 422,
  CONFIG_ERROR: 500,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string | number | boolean>;

  constructor(code: ErrorCode, message: string, details?: Record<string, string | number | boolean>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
