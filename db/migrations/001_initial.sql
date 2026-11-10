-- ScribMed RO – initial schema.
-- PRIVACY: this schema intentionally has NO tables or columns for audio,
-- transcripts, notes, patient names, CNP or any clinical content.

-- Requires PostgreSQL >= 13 (gen_random_uuid() is built in).

CREATE TABLE IF NOT EXISTS organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
  fiscal_code  text NULL CHECK (fiscal_code IS NULL OR char_length(fiscal_code) <= 20),
  city         text NULL CHECK (city IS NULL OR char_length(city) <= 100),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             text NOT NULL CHECK (role IN ('owner', 'admin', 'doctor')),
  external_id      text NULL,
  password_hash    text NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_external_id_unique ON users (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_org_idx ON users (organization_id);
-- Composite key used by tenant-consistent foreign keys below.
CREATE UNIQUE INDEX IF NOT EXISTS users_id_org_unique ON users (id, organization_id);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  user_id          uuid PRIMARY KEY,
  organization_id  uuid NOT NULL,
  full_name        text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 200),
  title            text NULL,
  specialty        text NOT NULL,
  stamp_code       text NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Guarantees a profile can never point at a user of a different tenant.
  FOREIGN KEY (user_id, organization_id) REFERENCES users (id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan                        text NOT NULL CHECK (plan IN ('trial', 'solo', 'clinic', 'enterprise')),
  status                      text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
  monthly_consultation_limit  integer NULL,
  seats                       integer NOT NULL DEFAULT 1,
  current_period_start        timestamptz NOT NULL,
  current_period_end          timestamptz NOT NULL,
  external_customer_id        text NULL,   -- reserved for Stripe
  external_subscription_id    text NULL    -- reserved for Stripe
);

-- Operational metadata only (counts, durations). No free-text columns.
CREATE TABLE IF NOT EXISTS usage_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  type             text NOT NULL CHECK (type IN (
                     'consultation_started', 'transcription_completed', 'transcription_failed',
                     'note_generated', 'note_generation_failed', 'session_cleared')),
  audio_seconds    integer NULL CHECK (audio_seconds IS NULL OR audio_seconds >= 0),
  processing_ms    integer NULL CHECK (processing_ms IS NULL OR processing_ms >= 0),
  redaction_count  integer NULL CHECK (redaction_count IS NULL OR redaction_count >= 0),
  specialty        text NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, organization_id) REFERENCES users (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS usage_events_org_created_idx ON usage_events (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
