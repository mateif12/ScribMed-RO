import "server-only";
import { getEnv } from "@/config/env";
import { getClinicalNoteProvider } from "@/lib/ai";
import { checkGrounding, type GroundingWarning } from "@/lib/ai/grounding";
import { NOTE_DISCLAIMER, NOTE_SECTIONS, normalizeNote, type NoteSections } from "@/lib/ai/note-format";
import { NoteProviderError } from "@/lib/ai/types";
import { AppError } from "@/lib/api/errors";
import { getRepository } from "@/lib/database";
import { startOfMonth } from "@/lib/database/repository";
import { getNerProvider } from "@/lib/security/ner";
import { containsDeterministicIdentifiers, scrubPii, type PiiType } from "@/lib/security/pii-scrubber";
import { safeLog } from "@/lib/security/logger";
import { getSpeechProvider } from "@/lib/speech";
import { SpeechProviderError } from "@/lib/speech/types";
import { wipeBuffer } from "@/lib/validation/audio";
import type { AuthContext, SpecialtyId } from "@/types/domain";

export type ProcessingStage = "transcribing" | "redacting";

export interface TranscriptionResult {
  /** De-identified transcript. The raw transcript never leaves the server. */
  transcript: string;
  redactions: Record<PiiType, number>;
  redactionTotal: number;
  provider: string;
}

async function assertQuota(auth: AuthContext): Promise<void> {
  const repo = await getRepository();
  const scope = { organizationId: auth.organizationId };
  const sub = await repo.getSubscription(scope);
  if (!sub) return;
  if (sub.status === "canceled" || sub.status === "past_due") {
    throw new AppError("QUOTA_EXCEEDED", "Abonamentul nu este activ. Contactați administratorul clinicii.");
  }
  if (sub.monthlyConsultationLimit !== null) {
    const usage = await repo.summarizeUsage(scope, { since: startOfMonth() });
    if (usage.notesGeneratedThisMonth >= sub.monthlyConsultationLimit) {
      throw new AppError("QUOTA_EXCEEDED", "Ați atins limita lunară de consultații a abonamentului.");
    }
  }
}

/**
 * Transcribes audio held in memory, then redacts identifiers. The audio buffer
 * is overwritten (best effort) as soon as the provider call completes.
 */
export async function transcribeAndRedact(params: {
  auth: AuthContext;
  audio: Uint8Array;
  mimeType: string;
  audioSeconds: number | null;
  onStage?: (stage: ProcessingStage) => void;
}): Promise<TranscriptionResult> {
  const { auth, mimeType, audioSeconds, onStage } = params;
  let audio: Uint8Array | null = params.audio;
  const started = Date.now();
  const repo = await getRepository();
  const scope = { organizationId: auth.organizationId };
  const provider = getSpeechProvider();
  try {
    await assertQuota(auth);
    onStage?.("transcribing");
    let raw: string | null = await provider.transcribe(audio, { mimeType, locale: getEnv().AZURE_SPEECH_LOCALE });
    wipeBuffer(audio);
    audio = null;

    if (!raw.trim()) throw new AppError("VALIDATION_ERROR", "Nu a fost detectată vorbire în înregistrare.");
    if (raw.length > getEnv().MAX_TRANSCRIPT_CHARS) throw new AppError("PAYLOAD_TOO_LARGE", "Transcrierea depășește lungimea maximă.");

    onStage?.("redacting");
    const redacted = await scrubPii(raw, getNerProvider());
    raw = null; // drop the only reference to the raw transcript

    await repo.recordUsageEvent(scope, {
      userId: auth.userId,
      type: "transcription_completed",
      audioSeconds: audioSeconds === null ? null : Math.round(audioSeconds),
      processingMs: Date.now() - started,
      redactionCount: redacted.total,
    });
    return { transcript: redacted.text, redactions: redacted.counts, redactionTotal: redacted.total, provider: provider.name };
  } catch (err) {
    await repo
      .recordUsageEvent(scope, { userId: auth.userId, type: "transcription_failed", processingMs: Date.now() - started })
      .catch(() => undefined);
    if (err instanceof AppError) throw err;
    if (err instanceof SpeechProviderError) {
      // Only enum-like fields are logged (kind, HTTP status, provider error code) – never messages.
      safeLog.warn({ event: "speech_provider_error", provider: provider.name, status: err.status ?? undefined, code: err.providerCode ?? err.kind });
      throw new AppError(err.kind === "unsupported_media" ? "UNSUPPORTED_MEDIA_TYPE" : "PROVIDER_ERROR", err.message);
    }
    throw err;
  } finally {
    wipeBuffer(audio);
  }
}

export interface NoteResult {
  note: string;
  sections: NoteSections;
  warnings: GroundingWarning[];
  provider: string;
  disclaimer: string;
}

/**
 * Generates a structured note. The transcript is ALWAYS re-redacted server-side
 * before reaching the LLM, even though /api/transcribe already returns a
 * redacted transcript (the client is not trusted). Nothing is persisted.
 */
export async function generateClinicalNote(params: {
  auth: AuthContext;
  transcript: string;
  specialty?: SpecialtyId;
}): Promise<NoteResult> {
  const { auth, specialty } = params;
  const started = Date.now();
  const repo = await getRepository();
  const scope = { organizationId: auth.organizationId };
  const provider = getClinicalNoteProvider();

  const redacted = await scrubPii(params.transcript, getNerProvider());
  if (containsDeterministicIdentifiers(redacted.text)) {
    // Defensive: should be unreachable – never send if detection is inconsistent.
    throw new AppError("VALIDATION_ERROR", "Transcrierea conține încă identificatori. Generarea a fost oprită.");
  }

  try {
    const generation = provider.generateNoteWithMetadata
      ? await provider.generateNoteWithMetadata(redacted.text, specialty)
      : { text: await provider.generateNote(redacted.text, specialty), model: provider.name, fallbackUsed: false };
    const normalized = normalizeNote(generation.text);
    const warnings = checkGrounding(normalized.text, redacted.text);
    if (generation.fallbackUsed) {
      // Never switch models silently: the doctor sees it and an operational event is logged.
      safeLog.warn({ event: "note_provider_fallback_used", provider: provider.name, code: generation.model });
      warnings.push({
        code: "FALLBACK_MODEL_USED",
        message: `Modelul principal a refuzat cererea; fișa a fost generată cu modelul de rezervă configurat (${generation.model}). Verificați cu atenție.`,
      });
    }
    for (const id of normalized.missingHeadings) {
      const label = NOTE_SECTIONS.find((s) => s.id === id)?.label ?? id;
      warnings.push({ code: "MISSING_SECTION", message: `Secțiunea „${label}” lipsea din răspunsul modelului și a fost completată automat.` });
    }
    if (/\[[A-Z_]+_ELIMINATA?\]/.test(normalized.text)) {
      warnings.push({ code: "PLACEHOLDER_LEAK", message: "Fișa conține marcaje de date eliminate. Verificați și editați textul." });
    }
    await repo.recordUsageEvent(scope, {
      userId: auth.userId,
      type: "note_generated",
      processingMs: Date.now() - started,
      redactionCount: redacted.total,
      specialty: specialty ?? null,
    });
    return { note: normalized.text, sections: normalized.sections, warnings, provider: provider.name, disclaimer: NOTE_DISCLAIMER };
  } catch (err) {
    await repo
      .recordUsageEvent(scope, { userId: auth.userId, type: "note_generation_failed", processingMs: Date.now() - started })
      .catch(() => undefined);
    if (err instanceof NoteProviderError) {
      safeLog.warn({ event: "note_provider_error", provider: provider.name, code: err.kind, status: err.status ?? undefined });
      throw new AppError(err.kind === "refusal" ? "PROVIDER_REFUSAL" : "PROVIDER_ERROR", err.message);
    }
    throw err;
  }
}

export async function recordConsultationEvent(auth: AuthContext, type: "consultation_started" | "session_cleared"): Promise<void> {
  const repo = await getRepository();
  await repo.recordUsageEvent({ organizationId: auth.organizationId }, { userId: auth.userId, type });
}
