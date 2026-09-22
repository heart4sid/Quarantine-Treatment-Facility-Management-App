/**
 * Zod validation schemas for all API request bodies.
 * TRD §8: Input validation is server-side; client validation is advisory only.
 *
 * Usage: parse with schema.safeParse(body); throw Errors.validationError on failure.
 */

import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────────────

/** UUIDv4/v7 string */
const uuidSchema = z.string().uuid();

/** YYYY-MM-DD date string */
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

/** Temperature in °C */
const temperatureCSchema = z
  .number()
  .min(30.0, "Temperature too low (below 30°C)")
  .max(45.0, "Temperature too high (above 45°C)");

// ─── POST /api/v1/admissions ──────────────────────────────────────────────────

export const admitPatientSchema = z.object({
  /**
   * Patient identity. Either:
   *   a) patientId: existing patient UUID (readmission or transfer)
   *   b) newPatient: intake data for a new patient registration
   */
  patientId: uuidSchema.optional(),
  newPatient: z
    .object({
      /** Patient's full name — will be AES-256-GCM encrypted at rest */
      name: z
        .string()
        .min(1, "Name is required")
        .max(200, "Name too long")
        .trim(),
      /** Date of birth (ISO 8601 date) — encrypted at rest */
      dateOfBirth: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD")
        .optional(),
      /** Medical Record Number — optional, facility-issued */
      mrn: z.string().max(50).optional(),
      /**
       * Identifier for readmission matching (national ID, passport, etc.)
       * Hashed with HMAC-SHA256; never stored in plaintext.
       * Optional — facilities without national ID systems omit this.
       */
      identityIdentifier: z.string().min(1).max(100).optional(),
    })
    .optional(),
  /** Target bed UUID. Must be in the same facility, active, and unoccupied. */
  bedId: uuidSchema,
  /**
   * Admission timestamp (UTC ISO 8601).
   * If omitted, server uses NOW(). Offline records may provide a past value.
   * Subject to clock-skew validation (max 72h past, no future).
   */
  admittedAt: z.string().datetime({ offset: true }).optional(),
  /**
   * Client-generated UUIDv7 for idempotent replay.
   * Offline sync must include this.
   */
  clientUuid: uuidSchema.optional(),
}).refine(
  (data) => data.patientId || data.newPatient,
  { message: "Either patientId or newPatient must be provided" }
);

export type AdmitPatientInput = z.infer<typeof admitPatientSchema>;

// ─── POST /api/v1/admissions/{id}/temperatures ────────────────────────────────

export const logTemperatureSchema = z.object({
  /** Temperature in degrees Celsius */
  valueC: temperatureCSchema,
  /**
   * Client-local timestamp (UTC ISO 8601).
   * Used to derive local_date if within skew window.
   */
  clientRecordedAt: z.string().datetime({ offset: true }).optional(),
  /** Client-generated UUIDv7 for idempotency */
  clientUuid: uuidSchema,
  /**
   * If the nurse is confirming re-entry after a same-day duplicate warning.
   * Must be explicitly true — cannot be accidentally set.
   */
  confirmedDuplicate: z.boolean().default(false),
});

export type LogTemperatureInput = z.infer<typeof logTemperatureSchema>;

// ─── POST /api/v1/temperatures/{id}/amendments ────────────────────────────────

export const amendTemperatureSchema = z.object({
  /**
   * New temperature value. Null means "remove this reading" (void).
   * Null amendments are only permitted by Doctor role (G10).
   */
  valueC: temperatureCSchema.nullable(),
  reasonCode: z.enum([
    "DATA_ENTRY_ERROR",
    "DEVICE_CALIBRATION",
    "WRONG_PATIENT",
    "DUPLICATE",
    "OTHER",
  ]),
  /** Required when reasonCode = "OTHER" (min 10 chars) */
  reasonNote: z.string().min(10).max(1000).optional(),
  clientUuid: uuidSchema,
}).refine(
  (d) => d.reasonCode !== "OTHER" || (d.reasonNote && d.reasonNote.length >= 10),
  { message: "reasonNote (min 10 chars) is required when reasonCode is OTHER", path: ["reasonNote"] }
);

export type AmendTemperatureInput = z.infer<typeof amendTemperatureSchema>;

// ─── POST /api/v1/admissions/{id}/visits ──────────────────────────────────────

export const startVisitSchema = z.object({
  notes: z.string().max(5000).optional(),
  /**
   * If true, doctor proceeds without a same-day temperature reading.
   * Requires exceptionReason (min 10 chars).
   */
  noTempException: z.boolean().default(false),
  exceptionReason: z.string().min(10).max(1000).optional(),
  /** Client timestamp for accurate local_date computation */
  clientStartedAt: z.string().datetime({ offset: true }).optional(),
  clientUuid: uuidSchema,
}).refine(
  (d) => !d.noTempException || (d.exceptionReason && d.exceptionReason.length >= 10),
  { message: "exceptionReason (min 10 chars) required when noTempException is true", path: ["exceptionReason"] }
);

export type StartVisitInput = z.infer<typeof startVisitSchema>;

// ─── POST /api/v1/admissions/{id}/discharge-approval ──────────────────────────

export const dischargeApprovalSchema = z.object({
  notes: z.string().max(2000).optional(),
});
export type DischargeApprovalInput = z.infer<typeof dischargeApprovalSchema>;

// ─── POST /api/v1/admissions/{id}/discharge ───────────────────────────────────

export const executeDischargeSchema = z.object({
  approvalId: uuidSchema,
  /** Confirmation flag — must be explicitly true */
  confirmed: z.literal(true),
});
export type ExecuteDischargeInput = z.infer<typeof executeDischargeSchema>;

// ─── POST /api/v1/admissions/{id}/outcome ────────────────────────────────────

export const recordOutcomeSchema = z.object({
  outcome: z.enum(["DECEASED", "TRANSFERRED"]), // DISCHARGED_CURED is set automatically
  notes: z.string().max(2000).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});
export type RecordOutcomeInput = z.infer<typeof recordOutcomeSchema>;

// ─── GET query param parsers ──────────────────────────────────────────────────

export const bedQuerySchema = z.object({
  wardId: uuidSchema.optional(),
  available: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export const waitlistQuerySchema = z.object({
  status: z.enum(["WAITING", "ADMITTED", "CANCELLED"]).default("WAITING"),
  limit: z
    .string()
    .default("50")
    .transform(Number)
    .pipe(z.number().int().min(1).max(200)),
  offset: z
    .string()
    .default("0")
    .transform(Number)
    .pipe(z.number().int().min(0)),
});

export const admissionsQuerySchema = z.object({
  status: z.enum(["open", "closed", "eligible"]).default("open"),
  wardId: uuidSchema.optional(),
  limit: z
    .string()
    .default("50")
    .transform(Number)
    .pipe(z.number().int().min(1).max(200)),
  offset: z
    .string()
    .default("0")
    .transform(Number)
    .pipe(z.number().int().min(0)),
});

export const nurseTaskQuerySchema = z.object({
  date: localDateSchema.optional(),
});
export type NurseTaskQueryInput = z.infer<typeof nurseTaskQuerySchema>;

export const doctorTaskQuerySchema = z.object({
  date: localDateSchema.optional(),
});
export type DoctorTaskQueryInput = z.infer<typeof doctorTaskQuerySchema>;

// ─── PIN management & Fast Switch (TRD §7.1, V1-§6) ────────────────────────────

export const setPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 numeric digits"),
});
export type SetPinInput = z.infer<typeof setPinSchema>;

export const switchPinSchema = z.object({
  targetUserId: uuidSchema,
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 numeric digits"),
});
export type SwitchPinInput = z.infer<typeof switchPinSchema>;

// ─── POST /api/v1/sync (TRD §8.2, §9, V1-§5.10) ────────────────────────────────

export const syncItemSchema = z.object({
  clientUuid: uuidSchema,
  type: z.enum(["temperature", "visit"]),
  clientRecordedAt: z.string().datetime({ offset: true }),
  admissionId: uuidSchema,
  payload: z.record(z.string(), z.any()),
});
export type SyncItemInput = z.infer<typeof syncItemSchema>;

export const batchSyncSchema = z.object({
  items: z.array(syncItemSchema).min(1, "At least one item required").max(100, "Maximum 100 items per sync"),
});
export type BatchSyncInput = z.infer<typeof batchSyncSchema>;

// ─── v2b: Treatment & Medication Schemas (TRD §11.1, V2-§4.2) ──────────────────

export const createMedOrderSchema = z.object({
  drugName: z.string().min(1, "Drug name is required").max(200),
  code: z.string().max(50).optional(),
  dose: z.string().min(1, "Dose is required").max(50),
  unit: z.string().min(1, "Unit is required").max(30),
  route: z.enum(["ORAL", "IV", "IM", "INHALED", "TOPICAL"]).default("ORAL"),
  frequencySpec: z.object({
    timesPerDay: z.number().int().min(1).max(12),
    hours: z.array(z.number().int().min(0).max(23)).min(1),
  }),
  durationDays: z.number().int().min(1).max(90).optional(),
});
export type CreateMedOrderInput = z.infer<typeof createMedOrderSchema>;

export const createTreatmentPlanSchema = z.object({
  diagnosisNotes: z.string().max(5000).optional(),
  orders: z.array(createMedOrderSchema).min(1, "At least one medication order is required"),
});
export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanSchema>;

export const administerMedSchema = z.object({
  status: z.enum(["ADMINISTERED", "MISSED", "REFUSED"]),
  notes: z.string().max(1000).optional(),
  clientUuid: uuidSchema,
});
export type AdministerMedInput = z.infer<typeof administerMedSchema>;


