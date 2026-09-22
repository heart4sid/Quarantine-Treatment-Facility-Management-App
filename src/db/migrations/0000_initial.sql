-- =============================================================================
-- M0 Initial Migration
-- Quarantine & Treatment Facility Management App
-- TRD §5.3: Schema conventions, invariants, RLS, immutability
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() fallback
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- future: patient name search

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'nurse',
  'doctor',
  'admin_staff',
  'facility_head',
  'system_admin',
  'pharmacist',
  'regional_admin'
);

CREATE TYPE admission_outcome AS ENUM (
  'DISCHARGED_CURED',
  'DECEASED',
  'TRANSFERRED'
);

CREATE TYPE waitlist_status AS ENUM (
  'WAITING',
  'ADMITTED',
  'CANCELLED'
);

CREATE TYPE amendment_reason AS ENUM (
  'DATA_ENTRY_ERROR',
  'DEVICE_CALIBRATION',
  'WRONG_PATIENT',
  'DUPLICATE',
  'OTHER'
);

CREATE TYPE audit_action AS ENUM (
  'PATIENT_ADMITTED',
  'PATIENT_WAITLISTED',
  'TEMP_LOGGED',
  'TEMP_AMENDED',
  'VISIT_STARTED',
  'DISCHARGE_ELIGIBLE_SET',
  'DISCHARGE_ELIGIBLE_CLEARED',
  'DISCHARGE_APPROVED',
  'DISCHARGE_APPROVAL_VOIDED',
  'DISCHARGE_EXECUTED',
  'OUTCOME_RECORDED',
  'OUTCOME_AMENDED',
  'USER_CREATED',
  'USER_DEACTIVATED',
  'ROLE_ASSIGNED',
  'ROLE_REVOKED',
  'PATIENT_ASSIGNED',
  'FEATURE_FLAG_CHANGED'
);

-- ─── Identity & Tenancy Tables ────────────────────────────────────────────────

CREATE TABLE facilities (
  id              UUID        PRIMARY KEY,
  name            TEXT        NOT NULL,
  timezone        TEXT        NOT NULL DEFAULT 'UTC',
  network_id      UUID,
  settings        JSONB       NOT NULL DEFAULT '{
    "fever_threshold_c": 38.0,
    "discharge_streak_days": 3,
    "streak_mode": "calendar",
    "mortality_alert_threshold": 0.15,
    "mortality_alert_min_sample": 10,
    "mortality_window_days": [7, 30],
    "occupancy_alert_pct": 0.90,
    "readmission_window_days": 14,
    "require_pharmacist_verification": false,
    "display_unit": "C"
  }'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ
);

CREATE TABLE wards (
  id              UUID        PRIMARY KEY,
  facility_id     UUID        NOT NULL REFERENCES facilities(id),
  name            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ
);

CREATE TABLE beds (
  id              UUID        PRIMARY KEY,
  facility_id     UUID        NOT NULL REFERENCES facilities(id),
  ward_id         UUID        NOT NULL REFERENCES wards(id),
  label           TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id              UUID        PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT,
  mfa_secret_enc  TEXT,
  mfa_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  pin_hash        TEXT,
  pin_failures    INTEGER     NOT NULL DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  display_name    TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ
);

CREATE TABLE user_roles (
  id          UUID        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id),
  role        user_role   NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID        REFERENCES users(id),
  revoked_at  TIMESTAMPTZ,
  -- One active role per user per type (role uniqueness enforced on active roles)
  UNIQUE (user_id, role)
);

CREATE TABLE user_facility_scopes (
  id          UUID        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id),
  facility_id UUID        NOT NULL REFERENCES facilities(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by  UUID        REFERENCES users(id),
  revoked_at  TIMESTAMPTZ,
  UNIQUE (user_id, facility_id)
);

CREATE TABLE sessions (
  id                 TEXT        PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES users(id),
  token              TEXT        NOT NULL UNIQUE,
  expires_at         TIMESTAMPTZ NOT NULL,
  ip_address         TEXT,
  user_agent         TEXT,
  active_facility_id UUID        REFERENCES facilities(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shifts (
  id              UUID        PRIMARY KEY,
  facility_id     UUID        NOT NULL REFERENCES facilities(id),
  name            TEXT        NOT NULL,
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ
);

CREATE TABLE patient_assignments (
  id          UUID        PRIMARY KEY,
  admission_id UUID       NOT NULL,
  user_id     UUID        NOT NULL REFERENCES users(id),
  shift_date  TEXT        NOT NULL,  -- YYYY-MM-DD facility-local
  shift_id    UUID        REFERENCES shifts(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID        REFERENCES users(id),
  revoked_at  TIMESTAMPTZ
);

-- ─── Clinical Tables ──────────────────────────────────────────────────────────

CREATE TABLE patients (
  id                  UUID        PRIMARY KEY,
  mrn                 TEXT,
  name_enc            TEXT        NOT NULL,
  dob_enc             TEXT,
  identity_hash       TEXT,
  possible_duplicate_of UUID      REFERENCES patients(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID        NOT NULL REFERENCES users(id)
);

-- Index for readmission matching by identity hash
CREATE INDEX idx_patients_identity_hash ON patients(identity_hash)
  WHERE identity_hash IS NOT NULL;

CREATE TABLE admissions (
  id                      UUID              PRIMARY KEY,
  patient_id              UUID              NOT NULL REFERENCES patients(id),
  facility_id             UUID              NOT NULL REFERENCES facilities(id),
  ward_id                 UUID              NOT NULL REFERENCES wards(id),
  bed_id                  UUID              NOT NULL REFERENCES beds(id),
  admitted_at             TIMESTAMPTZ       NOT NULL,
  admitted_by             UUID              NOT NULL REFERENCES users(id),
  discharge_eligible_since TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,
  outcome                 admission_outcome,
  readmission_of          UUID              REFERENCES admissions(id),
  version                 INTEGER           NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- TRD DB invariant: one open admission per bed (race condition safe)
CREATE UNIQUE INDEX one_open_admission_per_bed
  ON admissions(bed_id)
  WHERE closed_at IS NULL;

-- TRD DB invariant: one open admission per patient
CREATE UNIQUE INDEX one_open_admission_per_patient
  ON admissions(patient_id)
  WHERE closed_at IS NULL;

-- Query performance indexes
CREATE INDEX idx_admissions_facility ON admissions(facility_id);
CREATE INDEX idx_admissions_open ON admissions(facility_id, closed_at);
CREATE INDEX idx_admissions_patient ON admissions(patient_id);

CREATE TABLE waitlist_entries (
  id          UUID            PRIMARY KEY,
  facility_id UUID            NOT NULL REFERENCES facilities(id),
  patient_ref TEXT            NOT NULL,
  priority    INTEGER         NOT NULL DEFAULT 100,
  status      waitlist_status NOT NULL DEFAULT 'WAITING',
  admission_id UUID           REFERENCES admissions(id),
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by  UUID            NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_waitlist_facility_status
  ON waitlist_entries(facility_id, status, priority, created_at)
  WHERE status = 'WAITING';

CREATE TABLE temperature_readings (
  id                    UUID              PRIMARY KEY,
  admission_id          UUID              NOT NULL REFERENCES admissions(id),
  facility_id           UUID              NOT NULL REFERENCES facilities(id),
  value_c               REAL,
  recorded_at           TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  client_recorded_at    TIMESTAMPTZ,
  local_date            TEXT              NOT NULL,   -- YYYY-MM-DD
  recorded_by           UUID              NOT NULL REFERENCES users(id),
  is_fever              BOOLEAN,
  threshold_c_used      REAL,
  amends_id             UUID              REFERENCES temperature_readings(id),
  reason_code           amendment_reason,
  reason_note           TEXT,
  client_uuid           UUID              NOT NULL,
  clock_suspect         BOOLEAN           NOT NULL DEFAULT FALSE,
  is_duplicate_confirmed BOOLEAN          NOT NULL DEFAULT FALSE
);

-- TRD DB invariant: idempotent offline sync
CREATE UNIQUE INDEX uq_temp_client_uuid ON temperature_readings(client_uuid);

CREATE INDEX idx_temp_admission_date
  ON temperature_readings(facility_id, admission_id, local_date);
CREATE INDEX idx_temp_amends
  ON temperature_readings(amends_id)
  WHERE amends_id IS NOT NULL;

CREATE TABLE visits (
  id               UUID        PRIMARY KEY,
  admission_id     UUID        NOT NULL REFERENCES admissions(id),
  facility_id      UUID        NOT NULL REFERENCES facilities(id),
  doctor_id        UUID        NOT NULL REFERENCES users(id),
  started_at       TIMESTAMPTZ NOT NULL,
  local_date       TEXT        NOT NULL,  -- YYYY-MM-DD
  notes            TEXT,
  no_temp_exception BOOLEAN    NOT NULL DEFAULT FALSE,
  exception_reason TEXT,
  client_uuid      UUID        NOT NULL
);

CREATE UNIQUE INDEX uq_visits_client_uuid ON visits(client_uuid);
CREATE INDEX idx_visits_admission_date
  ON visits(facility_id, admission_id, local_date);
CREATE INDEX idx_visits_doctor_date ON visits(doctor_id, local_date);

CREATE TABLE discharge_approvals (
  id          UUID        PRIMARY KEY,
  admission_id UUID       NOT NULL REFERENCES admissions(id),
  facility_id UUID        NOT NULL REFERENCES facilities(id),
  doctor_id   UUID        NOT NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ NOT NULL,
  voided_at   TIMESTAMPTZ,
  void_reason TEXT,
  voided_by   UUID        REFERENCES users(id)
);

CREATE INDEX idx_discharge_approvals_admission
  ON discharge_approvals(admission_id, voided_at)
  WHERE voided_at IS NULL;

CREATE TABLE discharge_executions (
  id          UUID        PRIMARY KEY,
  admission_id UUID       NOT NULL REFERENCES admissions(id),
  facility_id UUID        NOT NULL REFERENCES facilities(id),
  approval_id UUID        NOT NULL REFERENCES discharge_approvals(id),
  admin_id    UUID        NOT NULL REFERENCES users(id),
  executed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE audit_log (
  id           UUID         PRIMARY KEY,
  at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  actor_user_id UUID        REFERENCES users(id),
  facility_id  UUID         REFERENCES facilities(id),
  action       audit_action NOT NULL,
  entity       TEXT         NOT NULL,
  entity_id    UUID,
  before       JSONB,
  after        JSONB,
  request_id   TEXT,
  ip           TEXT,
  device_id    TEXT
);

CREATE INDEX idx_audit_actor ON audit_log(actor_user_id, at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_facility ON audit_log(facility_id, at);

CREATE TABLE access_log (
  id            UUID        PRIMARY KEY,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID        NOT NULL REFERENCES users(id),
  facility_id   UUID        NOT NULL REFERENCES facilities(id),
  resource_type TEXT        NOT NULL,
  resource_id   UUID        NOT NULL,
  request_id    TEXT
);

CREATE INDEX idx_access_actor ON access_log(actor_user_id, at);
CREATE INDEX idx_access_resource ON access_log(resource_type, resource_id);

CREATE TABLE feature_flags (
  id          UUID        PRIMARY KEY,
  facility_id UUID        NOT NULL REFERENCES facilities(id),
  key         TEXT        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        REFERENCES users(id),
  UNIQUE (facility_id, key)
);

-- ─── Effective Temperature Readings View ─────────────────────────────────────
-- TRD §6.1: "effective" = not voided (no other row has amends_id pointing to it)
-- This is the ONLY view that clinical logic (streak, eligibility) queries.

CREATE OR REPLACE VIEW effective_temperature_readings AS
SELECT tr.*
FROM temperature_readings tr
WHERE
  -- Not voided: no amendment row points to this reading
  NOT EXISTS (
    SELECT 1 FROM temperature_readings amendment
    WHERE amendment.amends_id = tr.id
  )
  -- Not a void record itself (value_c IS NULL marks a "removal" amendment)
  AND tr.value_c IS NOT NULL;

COMMENT ON VIEW effective_temperature_readings IS
  'Effective temperature readings: excludes voided (amended) readings and '
  'void-only amendment rows. Use ONLY this view for clinical computations. '
  'TRD §6.1, DECISIONS.md G1.';

-- ─── Immutability Triggers ────────────────────────────────────────────────────
-- TRD §5.3: Clinical tables are append-only. No UPDATE or DELETE allowed
-- (except the specific mutable columns on admissions and discharge_approvals).

CREATE OR REPLACE FUNCTION forbid_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Mutation of % is not permitted — append only. '
    'Use the amendment workflow for corrections. '
    'Table: %, Operation: %',
    TG_TABLE_NAME, TG_TABLE_NAME, TG_OP;
END;
$$;

-- temperature_readings: completely immutable
CREATE TRIGGER trg_temp_readings_immutable
  BEFORE UPDATE OR DELETE ON temperature_readings
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- visits: completely immutable
CREATE TRIGGER trg_visits_immutable
  BEFORE UPDATE OR DELETE ON visits
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- discharge_executions: completely immutable
CREATE TRIGGER trg_discharge_executions_immutable
  BEFORE UPDATE OR DELETE ON discharge_executions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- audit_log: completely immutable
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- access_log: completely immutable
CREATE TRIGGER trg_access_log_immutable
  BEFORE UPDATE OR DELETE ON access_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- discharge_approvals: only voided_at, void_reason, voided_by can be set (once)
CREATE OR REPLACE FUNCTION guard_discharge_approval_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on discharge_approvals is not permitted.';
  END IF;

  -- Only allow setting voided_at (once), void_reason, voided_by
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Discharge approval % is already voided — cannot re-void.', OLD.id;
  END IF;

  -- Reject changes to immutable columns
  IF OLD.id           <> NEW.id           OR
     OLD.admission_id <> NEW.admission_id OR
     OLD.facility_id  <> NEW.facility_id  OR
     OLD.doctor_id    <> NEW.doctor_id    OR
     OLD.approved_at  <> NEW.approved_at  THEN
    RAISE EXCEPTION 'Immutable columns of discharge_approvals cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_discharge_approval_guard
  BEFORE UPDATE OR DELETE ON discharge_approvals
  FOR EACH ROW EXECUTE FUNCTION guard_discharge_approval_mutation();

-- ─── App Role & REVOKE ────────────────────────────────────────────────────────
-- The application connects as 'quarantine_app' (not superuser, no BYPASSRLS).
-- We revoke direct write access to clinical append-only tables.
-- The application uses INSERT only; UPDATE/DELETE are blocked at both the
-- trigger level AND the role level (defence in depth).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quarantine_app') THEN
    CREATE ROLE quarantine_app LOGIN;
  END IF;
END
$$;

-- Grant schema and sequence access
GRANT USAGE ON SCHEMA public TO quarantine_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO quarantine_app;

-- Tables where app role has SELECT + INSERT only (no UPDATE/DELETE)
GRANT SELECT, INSERT ON
  temperature_readings,
  visits,
  discharge_executions,
  audit_log,
  access_log
TO quarantine_app;

-- Tables where app role has SELECT + INSERT + limited UPDATE
GRANT SELECT, INSERT, UPDATE ON
  facilities,
  wards,
  beds,
  users,
  user_roles,
  user_facility_scopes,
  sessions,
  shifts,
  patient_assignments,
  patients,
  admissions,
  waitlist_entries,
  discharge_approvals,
  feature_flags
TO quarantine_app;

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- TRD §7.3: RLS with no BYPASSRLS. The app sets session-local config vars:
--   app.user_id       — authenticated user UUID
--   app.facility_ids  — comma-separated list of facility IDs the user is scoped to
--   app.role          — the user's primary role
--
-- Pattern: ENABLE RLS, then create PERMISSIVE policies.
-- No BYPASSRLS role is used; even migrations must set these vars if they
-- touch tenant-scoped data.

ALTER TABLE facilities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_facility_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE temperature_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE discharge_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE discharge_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags    ENABLE ROW LEVEL SECURITY;

-- Helper function: is this facility_id in the session's facility scope?
CREATE OR REPLACE FUNCTION is_facility_scoped(fid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT fid::TEXT = ANY(
    string_to_array(
      current_setting('app.facility_ids', true),
      ','
    )
  );
$$;

-- Facilities: user sees only their scoped facilities
CREATE POLICY facility_isolation ON facilities
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(id));

-- Wards: scoped by facility
CREATE POLICY ward_isolation ON wards
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Beds: scoped by facility
CREATE POLICY bed_isolation ON beds
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- user_facility_scopes: user sees their own scopes
CREATE POLICY ufs_isolation ON user_facility_scopes
  FOR ALL TO quarantine_app
  USING (
    user_id::TEXT = current_setting('app.user_id', true)
    OR is_facility_scoped(facility_id)
  );

-- Patients: accessible if the user is scoped to the facility of any open admission
-- (join-based check — efficient via admission indexes)
CREATE POLICY patient_isolation ON patients
  FOR ALL TO quarantine_app
  USING (
    EXISTS (
      SELECT 1 FROM admissions a
      WHERE a.patient_id = patients.id
        AND is_facility_scoped(a.facility_id)
    )
    OR created_by::TEXT = current_setting('app.user_id', true)
  );

-- Admissions: scoped by facility
CREATE POLICY admission_isolation ON admissions
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Waitlist: scoped by facility
CREATE POLICY waitlist_isolation ON waitlist_entries
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Temperature readings: scoped by facility
CREATE POLICY temp_isolation ON temperature_readings
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Visits: scoped by facility
CREATE POLICY visit_isolation ON visits
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Discharge approvals: scoped by facility
CREATE POLICY discharge_approval_isolation ON discharge_approvals
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Discharge executions: scoped by facility
CREATE POLICY discharge_execution_isolation ON discharge_executions
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Audit log: scoped by facility (system_admin sees all via separate path)
CREATE POLICY audit_isolation ON audit_log
  FOR ALL TO quarantine_app
  USING (
    facility_id IS NULL -- system-level entries
    OR is_facility_scoped(facility_id)
  );

-- Access log: scoped by facility
CREATE POLICY access_isolation ON access_log
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));

-- Feature flags: scoped by facility
CREATE POLICY feature_flag_isolation ON feature_flags
  FOR ALL TO quarantine_app
  USING (is_facility_scoped(facility_id));
