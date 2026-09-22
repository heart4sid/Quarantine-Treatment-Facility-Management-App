/**
 * v2 Schema Extensions:
 * - v2a: Notifications, Push Subscriptions, Daily Facility Metrics (TRD §10, §11.4)
 * - v2b: Treatment Plans, Medication Orders, Med Slots, Administrations (TRD §11.1)
 * - v2c: Networks, Regional Multi-Facility (TRD §11.2)
 * - v2d: Family Contacts, Family Links, Lab Ingestion (TRD §11.3, §11.5)
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { facilities, users } from "./identity";
import { admissions, patients } from "./clinical";

// ─── v2a: Notifications & Real-Time Alerts (TRD §10, V2-§4.1, §5.1) ───────────

/**
 * In-app notifications inbox table. Guaranteed in-app clinical record.
 * Inserted in the same transaction as the clinical write (never silently dropped).
 * STRICT RULE: No PHI in body_safe or title (TRD §10.2).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    /** Direct user recipient, or null for role-broadcast */
    userId: uuid("user_id").references(() => users.id),
    /** Target role for broadcasts: "doctor", "nurse", "admin_staff", "facility_head" */
    targetRole: text("target_role"),
    /** Event type e.g. "patient.discharge_eligible", "mortality.threshold_breached" */
    type: text("type").notNull(),
    title: text("title").notNull(),
    /** Strictly NO PHI text e.g. "1 new discharge-eligible patient in Ward A" */
    bodySafe: text("body_safe").notNull(),
    severity: text("severity").notNull().default("INFO"), // "INFO" | "WARNING" | "CRITICAL"
    /** Prevents alert storms (e.g. event:admission_id) */
    dedupeKey: text("dedupe_key"),
    admissionId: uuid("admission_id").references(() => admissions.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    facilityUserIdx: index("idx_notifications_user").on(t.facilityId, t.userId, t.createdAt),
    targetRoleIdx: index("idx_notifications_role").on(t.facilityId, t.targetRole, t.createdAt),
    dedupeIdx: index("idx_notifications_dedupe").on(t.facilityId, t.dedupeKey),
  })
);

/**
 * Delivery outbox per channel (TRD §10.2).
 * Retried by tick job with exponential backoff.
 */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().notNull(),
    notificationId: uuid("notification_id").notNull().references(() => notifications.id),
    channel: text("channel").notNull(), // "IN_APP" | "WEB_PUSH" | "EMAIL"
    status: text("status").notNull().default("PENDING"), // "PENDING" | "DELIVERED" | "FAILED"
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingIdx: index("idx_outbox_pending").on(t.status, t.nextAttemptAt),
  })
);

/**
 * Browser Web Push VAPID subscriptions (TRD §10.3).
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: uuid("user_id").notNull().references(() => users.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userEndpointIdx: uniqueIndex("uq_user_endpoint").on(t.userId, t.endpoint),
  })
);

/**
 * Pre-aggregated daily facility metrics rollups (TRD §11.4, V2-§4.5).
 */
export const dailyFacilityMetrics = pgTable(
  "daily_facility_metrics",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    date: text("date").notNull(), // YYYY-MM-DD
    admissionsCount: integer("admissions_count").notNull().default(0),
    dischargesCount: integer("discharges_count").notNull().default(0),
    deathsCount: integer("deaths_count").notNull().default(0),
    transfersCount: integer("transfers_count").notNull().default(0),
    peakOccupancy: integer("peak_occupancy").notNull().default(0),
    eodOccupancy: integer("eod_occupancy").notNull().default(0),
    avgLosHours: real("avg_los_hours").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    facilityDateIdx: uniqueIndex("uq_daily_metrics_date").on(t.facilityId, t.date),
  })
);

// ─── v2b: Treatment & Medication (TRD §11.1, V2-§4.2) ─────────────────────────

export const treatmentPlans = pgTable("treatment_plans", {
  id: uuid("id").primaryKey().notNull(),
  admissionId: uuid("admission_id").notNull().references(() => admissions.id),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  doctorId: uuid("doctor_id").notNull().references(() => users.id),
  status: text("status").notNull().default("ACTIVE"), // "ACTIVE" | "COMPLETED" | "SUPERSEDED"
  version: integer("version").notNull().default(1),
  supersedesId: uuid("supersedes_id"),
  diagnosisNotes: text("diagnosis_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicationOrders = pgTable("medication_orders", {
  id: uuid("id").primaryKey().notNull(),
  planId: uuid("plan_id").notNull().references(() => treatmentPlans.id),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  drugName: text("drug_name").notNull(),
  code: text("code"), // RxNorm / ATC
  dose: text("dose").notNull(),
  unit: text("unit").notNull(),
  route: text("route").notNull(), // "ORAL" | "IV" | "IM" | "INHALED"
  frequencySpec: jsonb("frequency_spec").notNull(), // { timesPerDay: 3, hours: [8, 14, 20] }
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  status: text("status").notNull().default("ACTIVE"), // "PENDING_VERIFICATION" | "ACTIVE" | "STOPPED"
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medSlots = pgTable(
  "med_slots",
  {
    id: uuid("id").primaryKey().notNull(),
    orderId: uuid("order_id").notNull().references(() => medicationOrders.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    admissionId: uuid("admission_id").notNull().references(() => admissions.id),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("SCHEDULED"), // "SCHEDULED" | "ADMINISTERED" | "MISSED" | "REFUSED"
    conflictFlag: boolean("conflict_flag").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dueIdx: index("idx_slots_due").on(t.facilityId, t.admissionId, t.dueAt),
  })
);

export const medAdministrations = pgTable(
  "med_administrations",
  {
    id: uuid("id").primaryKey().notNull(),
    slotId: uuid("slot_id").notNull().references(() => medSlots.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    status: text("status").notNull(), // "ADMINISTERED" | "MISSED" | "REFUSED"
    byUser: uuid("by_user").notNull().references(() => users.id),
    administeredAt: timestamp("administered_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    clientUuid: uuid("client_uuid").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clientUuidIdx: uniqueIndex("uq_med_admin_client_uuid").on(t.clientUuid),
  })
);

// ─── v2c: Multi-Facility Networks (TRD §11.2, V2-§4.3) ─────────────────────────

export const networks = pgTable("networks", {
  id: uuid("id").primaryKey().notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── v2d: Family Status & External Labs (TRD §11.3, §11.5, V2-§4.4, §4.6) ─────

export const familyContacts = pgTable("family_contacts", {
  id: uuid("id").primaryKey().notNull(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  nameEnc: text("name_enc").notNull(),
  contactEnc: text("contact_enc").notNull(), // phone / email AES-256-GCM
  channel: text("channel").notNull(), // "SMS" | "EMAIL"
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  consentBy: text("consent_by").notNull(),
  consentEvidenceRef: text("consent_evidence_ref"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const familyLinks = pgTable(
  "family_links",
  {
    id: uuid("id").primaryKey().notNull(),
    admissionId: uuid("admission_id").notNull().references(() => admissions.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    /** SHA-256 hash of random 256-bit token; raw token is NEVER stored (TRD §11.3) */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("uq_family_token_hash").on(t.tokenHash),
  })
);

export const labResultsInbox = pgTable(
  "lab_results_inbox",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    sourceId: text("source_id").notNull(),
    externalId: text("external_id").notNull(),
    testName: text("test_name").notNull(),
    testCode: text("test_code"),
    resultValue: text("result_value").notNull(),
    unit: text("unit"),
    referenceRange: text("reference_range"),
    isAbnormal: boolean("is_abnormal").notNull().default(false),
    patientIdentifierRaw: text("patient_identifier_raw"),
    resolvedAdmissionId: uuid("resolved_admission_id").references(() => admissions.id),
    status: text("status").notNull().default("PENDING_REVIEW"), // "PENDING_REVIEW" | "MATCHED" | "DISCARDED"
    rawFhirBundle: jsonb("raw_fhir_bundle"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    externalIdx: uniqueIndex("uq_lab_source_external").on(t.sourceId, t.externalId),
  })
);
