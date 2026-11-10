/**
 * Domain entities persisted by ScribMed RO.
 *
 * PRIVACY INVARIANT: none of these entities may hold clinical content
 * (audio, transcripts, notes, patient names, CNP, diagnoses). Only account,
 * organisation, subscription and operational metadata are persisted.
 */

export const ROLES = ["owner", "admin", "doctor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Proprietar organizație",
  admin: "Administrator",
  doctor: "Medic",
};

export interface Organization {
  id: string;
  name: string;
  /** Optional fiscal code (CUI) of the clinic. */
  fiscalCode: string | null;
  city: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  /** Identity provider subject (Cognito `sub`) or null for mock auth. */
  externalId: string | null;
  /** scrypt hash – only used by the local mock auth provider. */
  passwordHash: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface DoctorProfile {
  userId: string;
  organizationId: string;
  fullName: string;
  title: string | null;
  specialty: SpecialtyId;
  /** Cod parafă – professional stamp code. */
  stampCode: string | null;
  updatedAt: Date;
}

export const SUBSCRIPTION_PLANS = ["trial", "solo", "clinic", "enterprise"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface Subscription {
  id: string;
  organizationId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  /** Monthly consultation quota; null = unlimited. */
  monthlyConsultationLimit: number | null;
  seats: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Reserved for a future Stripe integration. */
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
}

/** Operational event types – never contain clinical content. */
export const USAGE_EVENT_TYPES = [
  "consultation_started",
  "transcription_completed",
  "transcription_failed",
  "note_generated",
  "note_generation_failed",
  "session_cleared",
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export interface UsageEvent {
  id: string;
  organizationId: string;
  userId: string;
  type: UsageEventType;
  /** Audio duration in seconds (operational, non-clinical). */
  audioSeconds: number | null;
  /** Processing time in ms. */
  processingMs: number | null;
  /** Count of redacted identifiers (number only, never the values). */
  redactionCount: number | null;
  specialty: SpecialtyId | null;
  createdAt: Date;
}

export interface UsageSummary {
  consultationsThisMonth: number;
  notesGeneratedThisMonth: number;
  audioMinutesThisMonth: number;
  averageProcessingSeconds: number | null;
}

// ---- Specialties --------------------------------------------------------
export const SPECIALTY_IDS = [
  "medicina_generala",
  "stomatologie",
  "dermatologie",
  "psihiatrie",
  "oftalmologie",
  "recuperare_medicala",
  "medicina_veterinara",
] as const;
export type SpecialtyId = (typeof SPECIALTY_IDS)[number];

/** Authenticated principal – the only identity object used in services. */
export interface AuthContext {
  userId: string;
  organizationId: string;
  role: Role;
  email: string;
}
