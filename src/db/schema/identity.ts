/**
 * Identity & Tenancy Tables
 * TRD §5.3 — Global conventions:
 * - Primary keys: UUIDv7 (time-ordered)
 * - Every tenant table has facility_id uuid NOT NULL
 * - Timestamps: timestamptz UTC
 * - No hard deletes; non-clinical tables use deactivated_at
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  unique,
  jsonb,
  integer,
  time,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "nurse",
  "doctor",
  "admin_staff",
  "facility_head",
  "system_admin",
  "pharmacist",      // v2b — optional, config-driven per facility
  "regional_admin",  // v2c — multi-facility
]);

// ─── Facilities ───────────────────────────────────────────────────────────────

/**
 * One row per physical facility (or logical unit).
 * settings JSON holds all configurable clinical thresholds — each has a
 * documented default and is labelled in DECISIONS.md as requiring clinical
 * sign-off (G1–G11).
 *
 * IMPORTANT: timezone cannot be changed after go-live (would corrupt
 * stored local_date values). See DECISIONS.md INF-2.
 */
export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().notNull(),
  name: text("name").notNull(),
  /** IANA timezone string e.g. "Asia/Kolkata". Immutable after go-live. */
  timezone: text("timezone").notNull().default("UTC"),
  /** nullable until v2c (multi-facility networks) */
  networkId: uuid("network_id"),
  /**
   * Per-facility configurable clinical settings (JSON).
   * All values have safe defaults; see DECISIONS.md for clinical sign-off status.
   * Schema:
   * {
   *   fever_threshold_c: number,          // default 38.0 — G1 pending sign-off
   *   discharge_streak_days: number,       // default 3   — G2 pending sign-off
   *   streak_mode: "calendar" | "rolling_72h",  // default "calendar" — G2
   *   mortality_alert_threshold: number,   // default 0.15 — G9
   *   mortality_alert_min_sample: number,  // default 10   — G9
   *   mortality_window_days: number[],     // default [7, 30] — G9
   *   occupancy_alert_pct: number,         // default 0.90 — V2-4.1
   *   readmission_window_days: number,     // default 14 — OQ10 pending
   *   require_pharmacist_verification: boolean, // default false — v2b
   *   display_unit: "C" | "F",            // default "C" — INF-1
   * }
   */
  settings: jsonb("settings").notNull().default({
    fever_threshold_c: 38.0,
    discharge_streak_days: 3,
    streak_mode: "calendar",
    mortality_alert_threshold: 0.15,
    mortality_alert_min_sample: 10,
    mortality_window_days: [7, 30],
    occupancy_alert_pct: 0.90,
    readmission_window_days: 14,
    require_pharmacist_verification: false,
    display_unit: "C",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
});

// ─── Wards ────────────────────────────────────────────────────────────────────

export const wards = pgTable("wards", {
  id: uuid("id").primaryKey().notNull(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
});

// ─── Beds ─────────────────────────────────────────────────────────────────────

/**
 * Capacity = count of active beds (is_active = true) per facility/ward.
 * The "74" is 74 rows — never a constant in code. (TRD §5.3, V1-§6 scalability)
 * Adding/deactivating beds is a System Admin function.
 */
export const beds = pgTable("beds", {
  id: uuid("id").primaryKey().notNull(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  wardId: uuid("ward_id").notNull().references(() => wards.id),
  /** Human-readable label e.g. "A-01", "ICU-3" */
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().notNull(),
  email: text("email").notNull().unique(),
  /** Argon2id hash. null if passkey-only. */
  passwordHash: text("password_hash"),
  /**
   * TOTP MFA secret — AES-256-GCM encrypted with FIELD_ENCRYPTION_KEY.
   * Required for: doctor, admin_staff, facility_head, system_admin, regional_admin.
   * Format: "v1:<base64-ciphertext>"
   */
  mfaSecretEnc: text("mfa_secret_enc"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  /**
   * Fast PIN for shared bedside tablets.
   * Argon2id hash of the PIN. null until PIN is set by the user.
   * PINs are rate-limited and locked after 5 failures.
   */
  pinHash: text("pin_hash"),
  pinFailures: integer("pin_failures").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
});

// ─── User Roles ───────────────────────────────────────────────────────────────

/**
 * A user may have multiple roles (e.g., doctor + facility_head).
 * Roles are evaluated across all entries for the user.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: userRoleEnum("role").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    // One active role per user per role type
    uniqueActiveRole: unique("uq_user_active_role").on(t.userId, t.role),
  })
);

// ─── User Facility Scopes ─────────────────────────────────────────────────────

/**
 * Scopes a user to one or more facilities.
 * v1: exactly one row per user (single facility).
 * v2c: multiple rows allowed (multi-facility staff).
 * Used to set app.facility_ids in the DB session for RLS.
 */
export const userFacilityScopes = pgTable(
  "user_facility_scopes",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: uuid("user_id").notNull().references(() => users.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid("granted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    uniqueScope: unique("uq_user_facility_scope").on(t.userId, t.facilityId),
  })
);

// ─── Sessions ─────────────────────────────────────────────────────────────────

/**
 * Server-side sessions (revocable by System Admin).
 * Better Auth manages this table; we declare it for schema awareness.
 */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey().notNull(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  /** The facility_id active when this session was created. */
  activeFacilityId: uuid("active_facility_id").references(() => facilities.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Shifts & Patient Assignments ────────────────────────────────────────────

/**
 * Shift definitions per facility. (TRD G6 — added to support "assigned patients"
 * and per-shift task-completion metrics that the PRD requires but doesn't model.)
 */
export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().notNull(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  name: text("name").notNull(), // e.g. "Morning", "Evening", "Night"
  startTime: time("start_time").notNull(), // facility-local
  endTime: time("end_time").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
});

/**
 * Which nurse/doctor is assigned to which patient admission on which shift-date.
 * Assignment is an Admin function (TRD G6).
 */
export const patientAssignments = pgTable(
  "patient_assignments",
  {
    id: uuid("id").primaryKey().notNull(),
    admissionId: uuid("admission_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id),
    shiftDate: text("shift_date").notNull(), // YYYY-MM-DD facility-local
    shiftId: uuid("shift_id").references(() => shifts.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  }
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const facilitiesRelations = relations(facilities, ({ many }) => ({
  wards: many(wards),
  userFacilityScopes: many(userFacilityScopes),
  shifts: many(shifts),
}));

export const wardsRelations = relations(wards, ({ one, many }) => ({
  facility: one(facilities, { fields: [wards.facilityId], references: [facilities.id] }),
  beds: many(beds),
}));

export const bedsRelations = relations(beds, ({ one }) => ({
  ward: one(wards, { fields: [beds.wardId], references: [wards.id] }),
  facility: one(facilities, { fields: [beds.facilityId], references: [facilities.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
  facilityScopes: many(userFacilityScopes),
  sessions: many(sessions),
}));
