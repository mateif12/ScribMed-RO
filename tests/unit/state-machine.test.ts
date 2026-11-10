import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  canTransition,
  consultationReducer,
  initialConsultationState,
  type ConsultationEvent,
  type ConsultationState,
  type ConsultationStatus,
} from "@/lib/consultation/state-machine";

const run = (events: ConsultationEvent[], from: ConsultationState = initialConsultationState) =>
  events.reduce(consultationReducer, from);

const happyPath: ConsultationEvent[] = [
  { type: "START_REQUESTED" },
  { type: "PERMISSION_GRANTED" },
  { type: "PAUSE" },
  { type: "RESUME" },
  { type: "STOP_AND_SUBMIT" },
  { type: "UPLOAD_PROGRESS", progress: 42.4 },
  { type: "UPLOAD_COMPLETE" },
  { type: "REDACTION_STARTED" },
  { type: "TRANSCRIPT_READY", transcript: "Pacient: [NUME_ELIMINAT] acuză tuse.", redactionTotal: 1 },
  { type: "NOTE_READY", note: "1. MOTIVELE PREZENTĂRII\nTuse", warnings: [], provider: "mock" },
];

describe("consultation state machine – recording state transitions", () => {
  it("walks the full happy path through every required state", () => {
    const visited: ConsultationStatus[] = [];
    happyPath.reduce((s, e) => {
      const next = consultationReducer(s, e);
      visited.push(next.status);
      return next;
    }, initialConsultationState);
    expect(visited).toEqual([
      "requesting_permission",
      "recording",
      "paused",
      "recording",
      "uploading",
      "uploading",
      "transcribing",
      "redacting",
      "generating_note",
      "completed",
    ]);
  });

  it("clamps and rounds upload progress", () => {
    const s = run([{ type: "START_REQUESTED" }, { type: "PERMISSION_GRANTED" }, { type: "STOP_AND_SUBMIT" }]);
    expect(consultationReducer(s, { type: "UPLOAD_PROGRESS", progress: 42.6 }).uploadProgress).toBe(43);
    expect(consultationReducer(s, { type: "UPLOAD_PROGRESS", progress: 140 }).uploadProgress).toBe(100);
    expect(consultationReducer(s, { type: "UPLOAD_PROGRESS", progress: -3 }).uploadProgress).toBe(0);
  });

  it("allows transcription to complete without a separate redaction event", () => {
    const s = run([...happyPath.slice(0, 7), { type: "TRANSCRIPT_READY", transcript: "x", redactionTotal: 0 }]);
    expect(s.status).toBe("generating_note");
  });

  it("ignores invalid transitions (returns the same state object)", () => {
    const idle = initialConsultationState;
    expect(consultationReducer(idle, { type: "PAUSE" })).toBe(idle);
    expect(consultationReducer(idle, { type: "STOP_AND_SUBMIT" })).toBe(idle);
    expect(consultationReducer(idle, { type: "NOTE_READY", note: "x", warnings: [], provider: "mock" })).toBe(idle);
    const recording = run(happyPath.slice(0, 2));
    expect(consultationReducer(recording, { type: "RESUME" })).toBe(recording);
    expect(consultationReducer(recording, { type: "START_REQUESTED" })).toBe(recording);
  });

  it("handles permission denial with a retry-start error", () => {
    const s = run([{ type: "START_REQUESTED" }, { type: "PERMISSION_DENIED", message: "refuzat" }]);
    expect(s.status).toBe("error");
    expect(s.error).toEqual({ message: "refuzat", retry: "start" });
    expect(s.failedIn).toBe("requesting_permission");
    expect(consultationReducer(s, { type: "START_REQUESTED" }).status).toBe("requesting_permission");
  });

  it("handles unexpected recording interruption, allowing transcription retry", () => {
    const s = run([...happyPath.slice(0, 2), { type: "RECORDING_INTERRUPTED", message: "microfon deconectat" }]);
    expect(s.status).toBe("error");
    expect(s.error?.retry).toBe("transcribe");
    expect(consultationReducer(s, { type: "RETRY_TRANSCRIBE" }).status).toBe("uploading");
  });

  it("only allows RETRY_TRANSCRIBE when the error is retryable by transcription", () => {
    const s = run([{ type: "START_REQUESTED" }, { type: "PERMISSION_DENIED", message: "x" }]);
    expect(consultationReducer(s, { type: "RETRY_TRANSCRIBE" })).toBe(s);
  });

  it("supports regeneration after completion and after a generation failure", () => {
    const done = run(happyPath);
    expect(consultationReducer(done, { type: "REGENERATE" }).status).toBe("generating_note");
    const failed = run([...happyPath.slice(0, 9), { type: "FAIL", message: "AI indisponibil", retry: "generate" }]);
    expect(failed.failedIn).toBe("generating_note");
    const regen = consultationReducer(failed, { type: "REGENERATE" });
    expect(regen.status).toBe("generating_note");
    expect(regen.error).toBeNull();
  });

  it("refuses regeneration if no transcript is held in memory", () => {
    const failed = run([{ type: "START_REQUESTED" }, { type: "FAIL", message: "x" }]);
    expect(consultationReducer(failed, { type: "REGENERATE" })).toBe(failed);
  });

  it("tracks doctor edits separately from the generated note", () => {
    const done = run(happyPath);
    const edited = consultationReducer(done, { type: "NOTE_EDITED", note: "editat" });
    expect(edited.note).toBe("editat");
    expect(edited.generatedNote).toBe("1. MOTIVELE PREZENTĂRII\nTuse");
  });

  it("session deletion: RESET from every state clears all clinical data", () => {
    const statuses = TRANSITIONS.RESET;
    expect(statuses).toHaveLength(10);
    const done = run(happyPath);
    const cleared = consultationReducer(done, { type: "RESET" });
    expect(cleared).toEqual(initialConsultationState);
    expect(cleared.transcript).toBeNull();
    expect(cleared.note).toBeNull();
    expect(cleared.generatedNote).toBeNull();
    for (const status of statuses) {
      expect(consultationReducer({ ...done, status }, { type: "RESET" })).toEqual(initialConsultationState);
    }
  });

  it("starting a new consultation never carries over data from the previous one", () => {
    const failedAfterNote = { ...run(happyPath), status: "error" as const };
    const restarted = consultationReducer(failedAfterNote, { type: "START_REQUESTED" });
    expect(restarted.transcript).toBeNull();
    expect(restarted.note).toBeNull();
  });

  it("canTransition matches the transition table", () => {
    expect(canTransition("recording", "PAUSE")).toBe(true);
    expect(canTransition("paused", "PAUSE")).toBe(false);
    expect(canTransition("completed", "FAIL")).toBe(false);
  });
});
