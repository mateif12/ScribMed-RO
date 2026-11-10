import type { Subscription, UsageEvent, UsageSummary } from "@/types/domain";

export function defaultTrialSubscription(organizationId: string, now = new Date()): Omit<Subscription, "id"> {
  const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  return {
    organizationId,
    plan: "trial",
    status: "trialing",
    monthlyConsultationLimit: 50,
    seats: 1,
    currentPeriodStart: now,
    currentPeriodEnd: end,
    externalCustomerId: null,
    externalSubscriptionId: null,
  };
}

export function summarize(events: UsageEvent[]): UsageSummary {
  const started = events.filter((e) => e.type === "consultation_started").length;
  const notes = events.filter((e) => e.type === "note_generated");
  const transcriptions = events.filter((e) => e.type === "transcription_completed");
  const audioSeconds = transcriptions.reduce((acc, e) => acc + (e.audioSeconds ?? 0), 0);
  const timed = [...transcriptions, ...notes].filter((e) => e.processingMs !== null);
  const avg = timed.length ? timed.reduce((a, e) => a + (e.processingMs ?? 0), 0) / timed.length / 1000 : null;
  return {
    consultationsThisMonth: started,
    notesGeneratedThisMonth: notes.length,
    audioMinutesThisMonth: Math.round((audioSeconds / 60) * 10) / 10,
    averageProcessingSeconds: avg === null ? null : Math.round(avg * 10) / 10,
  };
}
