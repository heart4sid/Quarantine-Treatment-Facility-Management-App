/**
 * Clinical Core Tables — Append-Only
 * TRD §5.3 — Clinical tables are append-only; amendments are new rows.
 * DB triggers (in migrations) enforce immutability at the Postgres level.
 * REVOKE UPDATE, DELETE, TRUNCATE is applied to the app DB role.
 *
 * All tables carry facility_id for RLS isolation (TRD §7.3).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  real,
  date,
  index,
  uniqueIndex,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { facilities, beds, wards, users } from "./identity";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const admissionOutcomeEnum = pgEnum("admission_outcome", [
  "DISCHARGED_CURED",
  "DECEASED",
  "TRANSFERRED",
]);

export const waitlistStatusEnum = pgEnum("waitlist_status", [
  "WAITING",
  "ADMITTED",
  "CANCELLED",
]);

export const amendmentReasonEnum = pgEnum("amendment_reason", [
  "DATA_ENTRY_ERROR",    // nurse/doctor typed wrong value
  "DEVICE_CALIBRATION", // thermometer was miscalibrated
  "WRONG_PATIENT",      // reading attributed to wrong patient
  "DUPLICATE",          // recording same reading twice
  "OTHER",              // requires free-text note
]);

export const auditActionEnum = pgEnum("audit_action", [
  "PATIENT_ADMITTED",
  "PATIENT_WAITLISTED",
  "TEMP_LOGGED",
  "TEMP_AMENDED",
  "VISIT_STARTED",
  "DISCHARGE_ELIGIBLE_SET",
  "DISCHARGE_ELIGIBLE_CLEARED",
  "DISCHARGE_APPROVED",
  "DISCHARGE_APPROVAL_VOIDED",
  "DISCHARGE_EXECUTED",
  "OUTCOME_RECORDED",
  "OUTCOME_AMENDED",
  "USER_CREATED",
  "USER_DEACTIVATED",
  "ROLE_ASSIGNED",
  "ROLE_REVOKED",
  "PATIENT_ASSIGNED",
  "FEATURE_FLAG_CHANGED",
]);

// ─── Patients ─────────────────────────────────────────────────────────────────

/**
 * Patients are global (not scoped to a facility) to support readmission
 * tracking across facilities in v2c. PII fields are AES-256-GCM encrypted.
 *
 * identity_hash: HMAC-SHA256 of normalized national ID (or equivalent),
 * using IDENTITY_HASH_PEPPER. Used for readmission matching without
 * exposing the raw identifier. See lib/crypto.ts.
 */
export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().notNull(),
  /** Medical Record Number — unencrypted, may be null if facility has none */
  mrn: text("mrn"),
  /** AES-256-GCM encrypted full name. Format: "v1:<base64>" */
  nameEnc: text("name_enc").notNull(),
  /** AES-256-GCM encrypted date of birth (ISO 8601). Format: "v1:<base64>" */
  dobEnc: text("dob_enc"),
  /**
   * HMAC-SHA256 of (normalized national ID | MRN | other strong identifier).
   * Used for readmission matching. Not reversible without the pepper.
   * null if no strong identifier is available.
   */
  identityHash: text("identity_hash"),
  /**
   * If this patient might be a duplicate of another (same name, similar DOB),
   * a staff member can flag it for manual review rather than auto-merging.
   * (TRD §11.4 readmission logic, V2-§5.5)
   */
  possibleDuplicateOf: uuid("possible_duplicate_of").references((): any => patients.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
});

// ─── Admissions ───────────────────────────────────────────────────────────────

/**
 * One admission = one patient stay. Open admission = closed_at IS NULL.
 *
 * DB invariants (enforced by partial unique indexes — see migrations):
 * - One open admission per bed:     UNIQUE (bed_id) WHERE closed_at IS NULL
 * - One open admission per patient: UNIQUE (patient_id) WHERE closed_at IS NULL
 *
 * Mutable columns (all others are append-only in spirit):
 * - discharge_eligible_since: set on eligibility transition, cleared on relapse
 * - closed_at + outcome: set once on discharge/death/transfer
 * - bed_id: only if patient is physically transferred to another bed
 * All mutations write an audit_log row in the SAME TRANSACTION.
 */
export const admissions = pgTable(
  "admissions",
  {
    id: uuid("id").primaryKey().notNull(),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    wardId: uuid("ward_id").notNull().references(() => wards.id),
    bedId: uuid("bed_id").notNull().references(() => beds.id),
    admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull(),
    admittedBy: uuid("admitted_by").notNull().references(() => users.id),
    /**
     * Set once when discharge eligibility is first achieved.
     * Cleared if a fever is logged after eligibility (relapse).
     * Used to measure "time from eligibility to discharge" (V1 §2 goal).
     */
    dischargeEligibleSince: timestamp("discharge_eligible_since", { withTimezone: true }),
    /** Closed when outcome is recorded. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    outcome: admissionOutcomeEnum("outcome"),
    /**
     * FK to a previous admission of the same patient (readmission tracking).
     * Set at admission time if identity_hash matches a recent closed admission.
     * (TRD §11.4, V2-§5.5)
     */
    readmissionOf: uuid("readmission_of").references((): any => admissions.id),
    /**
     * Optimistic concurrency version — incremented on every mutable update.
     * Clients send If-Match: version; server rejects stale writes.
     */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    facilityIdx: index("idx_admissions_facility").on(t.facilityId),
    openAdmissionsIdx: index("idx_admissions_open").on(t.facilityId, t.closedAt),
    patientIdx: index("idx_admissions_patient").on(t.patientId),
  })
);

// ─── Waitlist Entries ─────────────────────────────────────────────────────────

/**
 * Created when a patient arrives but no bed is available. (TRD §6.4, G7)
 * Ordering: FIFO (created_at) with optional priority column.
 */
export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").primaryKey().notNull(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  /**
   * Encrypted patient reference or contact details (pre-admission).
   * Format: "v1:<base64>" AES-256-GCM encrypted JSON with name/contact info.
   */
  patientRef: text("patient_ref").notNull(),
  /** Lower number = higher priority. Default 100 = normal. */
  priority: integer("priority").notNull().default(100),
  status: waitlistStatusEnum("status").notNull().default("WAITING"),
  /** Set when admitted from waitlist */
  admissionId: uuid("admission_id").references(() => admissions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
});

// ─── Temperature Readings ─────────────────────────────────────────────────────

/**
 * APPEND-ONLY. Never UPDATE or DELETE.
 * DB trigger forbids mutation. App role has REVOKE UPDATE, DELETE, TRUNCATE.
 *
 * Amendment pattern: create a new row with amends_id pointing to the original.
 * A "void" amendment has value_c = null (removes the reading from effective view).
 *
 * Effective readings = rows where value_c IS NOT NULL AND no row has amends_id = id.
 * See effective_temperature_readings view in views.ts.
 *
 * Idempotency: client_uuid UNIQUE prevents offline sync duplicates.
 *
 * local_date: computed ONCE at insert time using facility timezone.
 * This is the canonical "day" for all clinical logic. (TRD §6.1)
 */
export const temperatureReadings = pgTable(
  "temperature_readings",
  {
    id: uuid("id").primaryKey().notNull(),
    admissionId: uuid("admission_id").notNull().references(() => admissions.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    /**
     * Temperature in °C (canonical storage unit — INF-1).
     * null only for void amendments (removes reading from effective set).
     */
    valueC: real("value_c"),
    /** Server-assigned UTC timestamp */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Client-provided UTC timestamp (from nurse's device).
     * Used as local_date source if within accepted skew; otherwise server time used.
     * Offline entries: client records this when offline, server validates on sync.
     */
    clientRecordedAt: timestamp("client_recorded_at", { withTimezone: true }),
    /**
     * Facility-local calendar date: (recorded_at AT TIME ZONE facility.timezone)::date
     * Computed once at insert, stored to avoid recomputation and timezone-change bugs.
     * All "today" queries use this column. (TRD §6.1)
     */
    localDate: text("local_date").notNull(), // YYYY-MM-DD format
    recordedBy: uuid("recorded_by").notNull().references(() => users.id),
    /**
     * true if valueC >= fever_threshold_c at time of recording.
     * Computed and stored to avoid recomputation; threshold_c_used records which threshold.
     */
    isFever: boolean("is_fever"),
    /** The facility fever_threshold_c value used when classifying this reading. */
    thresholdCUsed: real("threshold_c_used"),
    /**
     * FK to the reading this row corrects. null for original readings.
     * Set for amendment rows. (TRD §6.8, V1-§5.9)
     */
    amendsId: uuid("amends_id").references((): any => temperatureReadings.id),
    /**
     * Required when amends_id is set. (TRD §6.8)
     */
    reasonCode: amendmentReasonEnum("reason_code"),
    reasonNote: text("reason_note"), // free text, required when reasonCode = OTHER
    /**
     * Client-generated UUIDv7 for idempotent offline sync.
     * UNIQUE index ensures replay safety. (TRD §5.4)
     */
    clientUuid: uuid("client_uuid").notNull(),
    /**
     * true if the client_recorded_at was outside accepted skew (not in future,
     * not older than 72h). Server used its own time for local_date in this case.
     * Flagged for review. (TRD §9)
     */
    clockSuspect: boolean("clock_suspect").notNull().default(false),
    /**
     * true if this is a second+ reading on the same local_date for this admission.
     * The nurse saw the "already logged" warning and confirmed re-entry.
     * (TRD §6.6, V1-§4.2)
     */
    isDuplicateConfirmed: boolean("is_duplicate_confirmed").notNull().default(false),
  },
  (t) => ({
    // Primary query index for task lists and streak computation
    admissionDateIdx: index("idx_temp_admission_date").on(t.facilityId, t.admissionId, t.localDate),
    // Idempotency for offline sync (TRD §5.4)
    clientUuidIdx: uniqueIndex("uq_temp_client_uuid").on(t.clientUuid),
    // Amendment lookup
    amendsIdx: index("idx_temp_amends").on(t.amendsId),
  })
);

// ─── Visits ───────────────────────────────────────────────────────────────────

/**
 * APPEND-ONLY. One visit = one doctor seeing a patient on one occasion.
 * A doctor may visit the same patient multiple times per day (no constraint on that).
 *
 * no_temp_exception: if true, the doctor proceeded without a temperature reading.
 * exception_reason is required in that case. (TRD §6.5, V1-§4.3, V1-§5.2)
 */
export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().notNull(),
    admissionId: uuid("admission_id").notNull().references(() => admissions.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    doctorId: uuid("doctor_id").notNull().references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    localDate: text("local_date").notNull(), // YYYY-MM-DD
    /** Doctor's clinical notes for this visit */
    notes: text("notes"),
    /** true if doctor proceeded without a same-day temperature reading (TRD §6.5) */
    noTempException: boolean("no_temp_exception").notNull().default(false),
    /**
     * Required (non-empty, min 10 chars) when no_temp_exception = true.
     * Reason is auditable and feeds Facility Head exception dashboard.
     */
    exceptionReason: text("exception_reason"),
    /** Client-generated UUIDv7 for idempotent offline sync */
    clientUuid: uuid("client_uuid").notNull(),
  },
  (t) => ({
    admissionDateIdx: index("idx_visits_admission_date").on(t.facilityId, t.admissionId, t.localDate),
    doctorDateIdx: index("idx_visits_doctor_date").on(t.doctorId, t.localDate),
    clientUuidIdx: uniqueIndex("uq_visits_client_uuid").on(t.clientUuid),
  })
);

// ─── Discharge Approvals ──────────────────────────────────────────────────────

/**
 * APPEND-ONLY (voided_at + void_reason are the only settable fields post-insert,
 * and setting them requires an audit_log row in the same transaction).
 *
 * One active (non-voided) approval per admission at a time.
 * voided_at is set when:
 *   - A fever is logged after approval (TRD §6.2 rule 4, G3)
 *   - Doctor manually withdraws approval
 */
export const dischargeApprovals = pgTable("discharge_approvals", {
  id: uuid("id").primaryKey().notNull(),
  admissionId: uuid("admission_id").notNull().references(() => admissions.id),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  doctorId: uuid("doctor_id").notNull().references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  voidedBy: uuid("voided_by").references(() => users.id),
});

// ─── Discharge Executions ─────────────────────────────────────────────────────

/**
 * APPEND-ONLY. Created when Admin executes a discharge.
 * The execution transaction:
 *   1. Validates eligibility is still current
 *   2. Inserts this row
 *   3. Sets admissions.closed_at and admissions.outcome = DISCHARGED_CURED
 *   4. Writes audit_log row
 *   5. Enqueues notifications
 * All in one database transaction. (TRD §6.3)
 */
export const dischargeExecutions = pgTable("discharge_executions", {
  id: uuid("id").primaryKey().notNull(),
  admissionId: uuid("admission_id").notNull().references(() => admissions.id),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  approvalId: uuid("approval_id").notNull().references(() => dischargeApprovals.id),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

/**
 * APPEND-ONLY, immutable. Source of truth for all write actions.
 * DB trigger + REVOKE prevents mutation.
 *
 * IMPORTANT: before/after JSON must NOT contain PII in plaintext.
 * PII fields in before/after should be either redacted ("***") or encrypted.
 * PHI must never appear in Vercel logs — only in this table. (TRD §7.4)
 *
 * (V1-§4.7, V1-§6 auditability)
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    facilityId: uuid("facility_id").references(() => facilities.id),
    action: auditActionEnum("action").notNull(),
    entity: text("entity").notNull(), // table name e.g. "admissions"
    entityId: uuid("entity_id"),
    /** Snapshot of changed fields BEFORE the action (PII redacted). */
    before: jsonb("before"),
    /** Snapshot of changed fields AFTER the action (PII redacted). */
    after: jsonb("after"),
    requestId: text("request_id"),
    ip: text("ip"),
    /** Device identifier (for shared tablet PIN tracking) */
    deviceId: text("device_id"),
  },
  (t) => ({
    actorIdx: index("idx_audit_actor").on(t.actorUserId, t.at),
    entityIdx: index("idx_audit_entity").on(t.entity, t.entityId),
    facilityIdx: index("idx_audit_facility").on(t.facilityId, t.at),
  })
);

// ─── Access Log ───────────────────────────────────────────────────────────────

/**
 * Log of READ access to patient-level records. (V1-§6: "access logs retained")
 * Helps detect inappropriate data access (e.g., a nurse viewing patients not
 * assigned to them).
 */
export const accessLog = pgTable(
  "access_log",
  {
    id: uuid("id").primaryKey().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").notNull().references(() => users.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    resourceType: text("resource_type").notNull(), // e.g. "patient", "admission"
    resourceId: uuid("resource_id").notNull(),
    requestId: text("request_id"),
  },
  (t) => ({
    actorIdx: index("idx_access_actor").on(t.actorUserId, t.at),
    resourceIdx: index("idx_access_resource").on(t.resourceType, t.resourceId),
  })
);

// ─── Feature Flags ────────────────────────────────────────────────────────────

/**
 * Per-facility feature flags for phased v2 rollout.
 * Keys: notifications, medications, family_view, lab_ingest, sms
 * (TRD §16)
 */
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => ({
    uniqueFlag: uniqueIndex("uq_feature_flag").on(t.facilityId, t.key),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const patientsRelations = relations(patients, ({ many }) => ({
  admissions: many(admissions),
}));

export const admissionsRelations = relations(admissions, ({ one, many }) => ({
  patient: one(patients, { fields: [admissions.patientId], references: [patients.id] }),
  facility: one(facilities, { fields: [admissions.facilityId], references: [facilities.id] }),
  bed: one(beds, { fields: [admissions.bedId], references: [beds.id] }),
  ward: one(wards, { fields: [admissions.wardId], references: [wards.id] }),
  temperatures: many(temperatureReadings),
  visits: many(visits),
  dischargeApprovals: many(dischargeApprovals),
  dischargeExecutions: many(dischargeExecutions),
}));

export const temperatureReadingsRelations = relations(temperatureReadings, ({ one }) => ({
  admission: one(admissions, { fields: [temperatureReadings.admissionId], references: [admissions.id] }),
  recordedByUser: one(users, { fields: [temperatureReadings.recordedBy], references: [users.id] }),
  amendsReading: one(temperatureReadings, { fields: [temperatureReadings.amendsId], references: [temperatureReadings.id] }),
}));

export const visitsRelations = relations(visits, ({ one }) => ({
  admission: one(admissions, { fields: [visits.admissionId], references: [admissions.id] }),
  doctor: one(users, { fields: [visits.doctorId], references: [users.id] }),
}));
