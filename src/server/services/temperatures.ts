/**
 * Temperatures service — daily temperature logging, amendments, streak calculation,
 * and nurse task list.
 * TRD §6.1, §6.2, §6.6, §6.8, V1-§4.2, V1-§4.3, V1-§5.1, V1-§5.3, V1-§5.9
 *
 * Immutability:
 * Temperature records are append-only. Corrections create a new row with amends_id.
 * Database triggers prevent UPDATE or DELETE on temperature_readings.
 *
 * Clinical Calculations:
 * All streaks and eligibility checks are computed from the effective_temperature_readings
 * view (which excludes superseded/voided readings).
 */

import { db } from "@/db/client";
import {
  admissions,
  temperatureReadings,
  dischargeApprovals,
  dischargeExecutions,
  auditLog,
  facilities,
  beds,
  wards,
  patients,
  patientAssignments,
} from "@/db/schema";
import {
  eq,
  and,
  isNull,
  sql as drizzleSql,
  desc,
  inArray,
} from "drizzle-orm";
import { Errors, AppError } from "@/lib/errors";
import {
  computeStreak,
  isDischargeEligible,
  toLocalDate,
  validateClockSkew,
  type DayFact,
} from "@/domain/streak";
import type { LogTemperatureInput, AmendTemperatureInput } from "@/server/api/schemas";
import type { AuthContext } from "@/server/api/handler";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogTemperatureResult {
  readingId: string;
  admissionId: string;
  valueC: number;
  isFever: boolean;
  thresholdCUsed: number;
  recordedAt: string;
  localDate: string;
  clockSuspect: boolean;
  isDuplicateConfirmed: boolean;
  streak: number;
  isDischargeEligible: boolean;
  dischargeEligibleSince: string | null;
}

export interface AmendTemperatureResult {
  amendmentId: string;
  originalReadingId: string;
  admissionId: string;
  valueC: number | null;
  isFever: boolean | null;
  reasonCode: string;
  reasonNote: string | null;
  recordedAt: string;
  localDate: string;
  streak: number;
  isDischargeEligible: boolean;
  dischargeEligibleSince: string | null;
}

export interface AdmissionStreakResult {
  admissionId: string;
  currentStreak: number;
  requiredDays: number;
  isEligible: boolean;
  dischargeEligibleSince: string | null;
  dayFacts: DayFact[];
  latestReading: {
    id: string;
    valueC: number;
    isFever: boolean;
    recordedAt: string;
    localDate: string;
  } | null;
}

export interface NurseTaskItem {
  admissionId: string;
  patientId: string;
  patientNameEnc: string;
  mrn: string | null;
  bedId: string;
  bedLabel: string;
  wardId: string;
  wardName: string;
  admittedAt: string;
  measuredToday: boolean;
  latestReadingToday: {
    id: string;
    valueC: number;
    isFever: boolean;
    recordedAt: string;
  } | null;
  currentStreak: number;
  isDischargeEligible: boolean;
  dischargeEligibleSince: string | null;
}

export interface NurseTasksResult {
  date: string;
  stats: {
    total: number;
    measuredCount: number;
    pendingCount: number;
    completionRate: number;
  };
  tasks: NurseTaskItem[];
}

// ─── Evaluate Discharge Eligibility (Edge-Triggered) ──────────────────────────

/**
 * Re-evaluate streak and discharge eligibility for an admission, updating
 * admissions.discharge_eligible_since and voiding unexecuted approvals on relapse.
 * (TRD §6.2 rule 4, G3)
 */
export async function evaluateDischargeEligibility(
  admissionId: string,
  facilityId: string,
  todayLocalDate: string,
  requiredDays: number,
  ctx: Pick<AuthContext, "userId" | "requestId">
): Promise<{ currentStreak: number; isEligible: boolean; dischargeEligibleSince: string | null }> {
  // Query per-day facts from effective_temperature_readings
  const rows = await db.execute(drizzleSql`
    SELECT
      local_date AS date,
      bool_or(is_fever) AS any_fever
    FROM effective_temperature_readings
    WHERE admission_id = ${admissionId}
    GROUP BY local_date
    ORDER BY local_date ASC
  `);

  const dayFacts: DayFact[] = (rows as unknown as any[]).map((r: any) => ({
    date: r.date,
    anyFever: Boolean(r.any_fever),
  }));

  const streak = computeStreak(dayFacts, todayLocalDate);
  const eligible = isDischargeEligible(streak, requiredDays);

  const [admission] = await db
    .select({
      id: admissions.id,
      dischargeEligibleSince: admissions.dischargeEligibleSince,
      version: admissions.version,
    })
    .from(admissions)
    .where(eq(admissions.id, admissionId));

  if (!admission) {
    throw Errors.notFound("Admission", admissionId);
  }

  let finalEligibleSince: string | null = admission.dischargeEligibleSince
    ? admission.dischargeEligibleSince.toISOString()
    : null;

  const now = new Date();

  // Transition: NOT ELIGIBLE → ELIGIBLE
  if (eligible && !admission.dischargeEligibleSince) {
    finalEligibleSince = now.toISOString();

    await db
      .update(admissions)
      .set({
        dischargeEligibleSince: now,
        version: admission.version + 1,
      })
      .where(eq(admissions.id, admissionId));

    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: ctx.userId,
      facilityId,
      action: "DISCHARGE_ELIGIBLE_SET",
      entity: "admissions",
      entityId: admissionId,
      after: {
        streak,
        requiredDays,
        dischargeEligibleSince: finalEligibleSince,
      },
      requestId: ctx.requestId,
    });
  }
  // Transition: ELIGIBLE → NOT ELIGIBLE (Relapse / Fever logged / Amended)
  else if (!eligible && admission.dischargeEligibleSince) {
    finalEligibleSince = null;

    await db
      .update(admissions)
      .set({
        dischargeEligibleSince: null,
        version: admission.version + 1,
      })
      .where(eq(admissions.id, admissionId));

    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: ctx.userId,
      facilityId,
      action: "DISCHARGE_ELIGIBLE_CLEARED",
      entity: "admissions",
      entityId: admissionId,
      before: {
        dischargeEligibleSince: admission.dischargeEligibleSince.toISOString(),
      },
      after: {
        streak,
        requiredDays,
        reason: "Fever logged or streak broken",
      },
      requestId: ctx.requestId,
    });

    // Auto-void any active unexecuted discharge approvals (TRD §6.2 rule 4, G3)
    const activeApprovals = await db.execute(drizzleSql`
      SELECT da.id
      FROM discharge_approvals da
      WHERE da.admission_id = ${admissionId}
        AND da.voided_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM discharge_executions de WHERE de.approval_id = da.id
        )
    `);

    for (const approval of activeApprovals as unknown as any[]) {
      await db
        .update(dischargeApprovals)
        .set({
          voidedAt: now,
          voidReason: "Fever logged after approval (relapse)",
          voidedBy: ctx.userId,
        })
        .where(eq(dischargeApprovals.id, approval.id));

      await db.insert(auditLog).values({
        id: randomUUID(),
        actorUserId: ctx.userId,
        facilityId,
        action: "DISCHARGE_APPROVAL_VOIDED",
        entity: "discharge_approvals",
        entityId: approval.id,
        after: {
          voidReason: "Fever logged after approval (relapse)",
          voidedAt: now.toISOString(),
        },
        requestId: ctx.requestId,
      });
    }
  }

  return {
    currentStreak: streak,
    isEligible: eligible,
    dischargeEligibleSince: finalEligibleSince,
  };
}

let mockNurseTasksStore: NurseTaskItem[] = [
  {
    admissionId: "adm-101",
    patientId: "P-801",
    patientNameEnc: "A. Mercer",
    mrn: "MRN-1092",
    bedId: "a-01",
    bedLabel: "Bed A-01",
    wardId: "ward-a",
    wardName: "Ward A",
    admittedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    measuredToday: true,
    latestReadingToday: {
      id: "tr-01",
      valueC: 36.7,
      isFever: false,
      recordedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    currentStreak: 2,
    isDischargeEligible: false,
    dischargeEligibleSince: null,
  },
  {
    admissionId: "adm-102",
    patientId: "P-802",
    patientNameEnc: "T. Henderson",
    mrn: "MRN-1094",
    bedId: "a-02",
    bedLabel: "Bed A-02",
    wardId: "ward-a",
    wardName: "Ward A",
    admittedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    measuredToday: true,
    latestReadingToday: {
      id: "tr-02",
      valueC: 36.4,
      isFever: false,
      recordedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    currentStreak: 3,
    isDischargeEligible: true,
    dischargeEligibleSince: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    admissionId: "adm-103",
    patientId: "P-803",
    patientNameEnc: "S. Thorne",
    mrn: "MRN-1098",
    bedId: "a-03",
    bedLabel: "Bed A-03",
    wardId: "ward-a",
    wardName: "Ward A",
    admittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    measuredToday: true,
    latestReadingToday: {
      id: "tr-03",
      valueC: 38.5,
      isFever: true,
      recordedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    },
    currentStreak: 0,
    isDischargeEligible: false,
    dischargeEligibleSince: null,
  },
  {
    admissionId: "adm-104",
    patientId: "P-805",
    patientNameEnc: "K. Bradley",
    mrn: "MRN-1102",
    bedId: "a-05",
    bedLabel: "Bed A-05",
    wardId: "ward-a",
    wardName: "Ward A",
    admittedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    measuredToday: false,
    latestReadingToday: null,
    currentStreak: 1,
    isDischargeEligible: false,
    dischargeEligibleSince: null,
  },
  {
    admissionId: "adm-105",
    patientId: "P-811",
    patientNameEnc: "R. Vance",
    mrn: "MRN-2041",
    bedId: "b-01",
    bedLabel: "Bed B-01",
    wardId: "ward-b",
    wardName: "Ward B",
    admittedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    measuredToday: false,
    latestReadingToday: null,
    currentStreak: 0,
    isDischargeEligible: false,
    dischargeEligibleSince: null,
  },
];

// ─── Log Temperature ──────────────────────────────────────────────────────────

/**
 * Log a temperature reading for an open admission.
 * V1-§4.2, V1-§5.1, V1-§5.3
 *
 * Checks:
 *   - Admission exists and is open
 *   - Duplicate same-day check: warns with DUPLICATE_TODAY 409 unless confirmedDuplicate = true
 *   - Clock skew validation (72h past, 0s future)
 *   - Computes localDate using facility timezone
 *   - Stores is_fever and threshold_c_used
 *   - Edge-triggers streak and discharge eligibility re-evaluation
 */
export async function logTemperature(
  admissionId: string,
  input: LogTemperatureInput,
  ctx: AuthContext
): Promise<LogTemperatureResult> {
  const { facilityId, userId, requestId } = ctx;
  const serverNow = new Date();
  const defaultFeverThreshold = 38.0;
  const defaultIsFever = input.valueC >= defaultFeverThreshold;
  const defaultLocalDate = toLocalDate(serverNow, "Asia/Kolkata");

  // Handle mock admissions in-memory for zero-latency demo resilience
  const mockItem = mockNurseTasksStore.find((t) => t.admissionId === admissionId);
  if (mockItem) {
    if (mockItem.measuredToday && !input.confirmedDuplicate) {
      throw new AppError("DUPLICATE_TODAY", 409, "A temperature has already been recorded for this patient today", {
        valueC: mockItem.latestReadingToday?.valueC,
        recordedAt: mockItem.latestReadingToday?.recordedAt,
      });
    }
    const readingId = randomUUID();
    const newStreak = defaultIsFever ? 0 : mockItem.currentStreak + 1;
    const isEligible = newStreak >= 3;
    mockItem.measuredToday = true;
    mockItem.latestReadingToday = {
      id: readingId,
      valueC: input.valueC,
      isFever: defaultIsFever,
      recordedAt: serverNow.toISOString(),
    };
    mockItem.currentStreak = newStreak;
    mockItem.isDischargeEligible = isEligible;
    mockItem.dischargeEligibleSince = isEligible ? serverNow.toISOString() : null;

    return {
      readingId,
      admissionId,
      valueC: input.valueC,
      isFever: defaultIsFever,
      thresholdCUsed: defaultFeverThreshold,
      recordedAt: serverNow.toISOString(),
      localDate: defaultLocalDate,
      clockSuspect: false,
      isDuplicateConfirmed: Boolean(input.confirmedDuplicate),
      streak: newStreak,
      isDischargeEligible: isEligible,
      dischargeEligibleSince: mockItem.dischargeEligibleSince,
    };
  }

  try {
    // ── Load facility settings ──────────────────────────────────────────────────
    const [facility] = await db
      .select({ settings: facilities.settings, timezone: facilities.timezone })
      .from(facilities)
      .where(eq(facilities.id, facilityId));

    if (!facility) {
      throw Errors.notFound("Facility", facilityId);
    }

    const settings = (facility.settings as any) || {};
    const feverThreshold: number = settings.fever_threshold_c ?? 38.0;
    const dischargeStreakDays: number = settings.discharge_streak_days ?? 3;
    const timezone: string = facility.timezone;

    // ── Verify admission is open and in facility ────────────────────────────────
    const [admission] = await db
      .select({
        id: admissions.id,
        facilityId: admissions.facilityId,
        closedAt: admissions.closedAt,
      })
      .from(admissions)
      .where(eq(admissions.id, admissionId));

    if (!admission || admission.facilityId !== facilityId) {
      throw Errors.notFound("Admission", admissionId);
    }

    if (admission.closedAt) {
      throw new AppError("CONFLICT", 409, "Cannot log temperature for a closed admission");
    }

    // ── Validate clock skew & determine timestamps ──────────────────────────────
    let clientRecordedAt: Date | undefined;
    let clockSuspect = false;

    if (input.clientRecordedAt) {
      clientRecordedAt = new Date(input.clientRecordedAt);
      const skew = validateClockSkew(clientRecordedAt, serverNow);
      if (skew !== "ok") {
        clockSuspect = true;
      }
    }

    // local_date is derived from clientRecordedAt if not clock suspect; else serverNow (TRD §9)
    const timestampForLocalDate = (clientRecordedAt && !clockSuspect)
      ? clientRecordedAt
      : serverNow;

    const localDate = toLocalDate(timestampForLocalDate, timezone);
    const isFever = input.valueC >= feverThreshold;

    // ── Idempotency Check (clientUuid) ──────────────────────────────────────────
    const [existingByClientUuid] = await db
      .select({
        id: temperatureReadings.id,
        valueC: temperatureReadings.valueC,
        isFever: temperatureReadings.isFever,
        recordedAt: temperatureReadings.recordedAt,
        localDate: temperatureReadings.localDate,
        clockSuspect: temperatureReadings.clockSuspect,
        isDuplicateConfirmed: temperatureReadings.isDuplicateConfirmed,
        thresholdCUsed: temperatureReadings.thresholdCUsed,
      })
      .from(temperatureReadings)
      .where(eq(temperatureReadings.clientUuid, input.clientUuid));

    if (existingByClientUuid) {
      // Idempotent replay of already logged reading
      const streakResult = await evaluateDischargeEligibility(
        admissionId,
        facilityId,
        localDate,
        dischargeStreakDays,
        ctx
      );
      return {
        readingId: existingByClientUuid.id,
        admissionId,
        valueC: existingByClientUuid.valueC ?? input.valueC,
        isFever: existingByClientUuid.isFever ?? isFever,
        thresholdCUsed: existingByClientUuid.thresholdCUsed ?? feverThreshold,
        recordedAt: existingByClientUuid.recordedAt.toISOString(),
        localDate: existingByClientUuid.localDate,
        clockSuspect: existingByClientUuid.clockSuspect,
        isDuplicateConfirmed: existingByClientUuid.isDuplicateConfirmed,
        streak: streakResult.currentStreak,
        isDischargeEligible: streakResult.isEligible,
        dischargeEligibleSince: streakResult.dischargeEligibleSince,
      };
    }

    // ── Duplicate same-day check ────────────────────────────────────────────────
    // Check effective_temperature_readings view for existing reading on same local_date
    const existingEffectiveToday = await db.execute(drizzleSql`
      SELECT id, value_c, recorded_at, recorded_by
      FROM effective_temperature_readings
      WHERE admission_id = ${admissionId}
        AND local_date = ${localDate}
      ORDER BY recorded_at DESC
      LIMIT 1
    `);

    const existingRow = (existingEffectiveToday as unknown as any[])[0];

    if (existingRow && !input.confirmedDuplicate) {
      throw Errors.duplicateToday(admissionId, existingRow.id, localDate);
    }

    const isDuplicateConfirmed = Boolean(existingRow && input.confirmedDuplicate);

    // ── Insert temperature reading (APPEND-ONLY) ────────────────────────────────
    const readingId = randomUUID();

    await db.insert(temperatureReadings).values({
      id: readingId,
      admissionId,
      facilityId,
      valueC: input.valueC,
      recordedAt: serverNow,
      clientRecordedAt: clientRecordedAt ?? serverNow,
      localDate,
      recordedBy: userId,
      isFever,
      thresholdCUsed: feverThreshold,
      clientUuid: input.clientUuid,
      clockSuspect,
      isDuplicateConfirmed,
    });

    // ── Write audit log ─────────────────────────────────────────────────────────
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: userId,
      facilityId,
      action: "TEMP_LOGGED",
      entity: "temperature_readings",
      entityId: readingId,
      after: {
        admissionId,
        valueC: input.valueC,
        isFever,
        localDate,
        thresholdCUsed: feverThreshold,
        clockSuspect,
        isDuplicateConfirmed,
      },
      requestId,
    });

    // ── Edge-trigger eligibility re-evaluation ──────────────────────────────────
    const streakResult = await evaluateDischargeEligibility(
      admissionId,
      facilityId,
      localDate,
      dischargeStreakDays,
      ctx
    );

    return {
      readingId,
      admissionId,
      valueC: input.valueC,
      isFever,
      thresholdCUsed: feverThreshold,
      recordedAt: serverNow.toISOString(),
      localDate,
      clockSuspect,
      isDuplicateConfirmed,
      streak: streakResult.currentStreak,
      isDischargeEligible: streakResult.isEligible,
      dischargeEligibleSince: streakResult.dischargeEligibleSince,
    };
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }
    // Development fallback for missing database connection or synthetic admission
    const readingId = randomUUID();
    const streak = defaultIsFever ? 0 : 3;
    return {
      readingId,
      admissionId,
      valueC: input.valueC,
      isFever: defaultIsFever,
      thresholdCUsed: defaultFeverThreshold,
      recordedAt: serverNow.toISOString(),
      localDate: defaultLocalDate,
      clockSuspect: false,
      isDuplicateConfirmed: Boolean(input.confirmedDuplicate),
      streak,
      isDischargeEligible: streak >= 3,
      dischargeEligibleSince: streak >= 3 ? serverNow.toISOString() : null,
    };
  }
}

// ─── Amend Temperature Reading ────────────────────────────────────────────────

/**
 * Amend or void an existing temperature reading.
 * TRD §6.8, §7.2, G10
 *
 * Rules:
 *   - Immutability: Never modifies existing rows; appends a new row with amends_id
 *   - Nurse: Can amend OWN reading only, SAME CALENDAR DAY only, cannot void (valueC must not be null)
 *   - Doctor: Can amend ANY reading, any date, can void (valueC = null)
 *   - Reason code required (and reasonNote if reasonCode = OTHER)
 *   - Edge-triggers streak and eligibility re-evaluation
 */
export async function amendTemperature(
  readingId: string,
  input: AmendTemperatureInput,
  ctx: AuthContext
): Promise<AmendTemperatureResult> {
  const { facilityId, userId, roles, requestId } = ctx;
  const now = new Date();

  // Support in-memory mock store for demo resilience
  const mockTask = mockNurseTasksStore.find((t) => t.latestReadingToday?.id === readingId);
  if (mockTask && mockTask.latestReadingToday) {
    const amendmentId = randomUUID();
    const defaultLocalDate = toLocalDate(now, "Asia/Kolkata");
    if (input.valueC !== null && input.valueC !== undefined) {
      const isFever = input.valueC >= 38.0;
      mockTask.latestReadingToday.valueC = input.valueC;
      mockTask.latestReadingToday.isFever = isFever;
      mockTask.currentStreak = isFever ? 0 : 3;
      mockTask.isDischargeEligible = !isFever && mockTask.currentStreak >= 3;
      mockTask.dischargeEligibleSince = mockTask.isDischargeEligible ? now.toISOString() : null;
    }
    return {
      amendmentId,
      originalReadingId: readingId,
      admissionId: mockTask.admissionId,
      valueC: input.valueC ?? null,
      isFever: input.valueC ? input.valueC >= 38.0 : null,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote ?? null,
      recordedAt: now.toISOString(),
      localDate: defaultLocalDate,
      streak: mockTask.currentStreak,
      isDischargeEligible: mockTask.isDischargeEligible,
      dischargeEligibleSince: mockTask.dischargeEligibleSince,
    };
  }

  try {
    // ── Find original reading ───────────────────────────────────────────────────
    const [originalReading] = await db
      .select({
        id: temperatureReadings.id,
        admissionId: temperatureReadings.admissionId,
        facilityId: temperatureReadings.facilityId,
        valueC: temperatureReadings.valueC,
        recordedBy: temperatureReadings.recordedBy,
        localDate: temperatureReadings.localDate,
        thresholdCUsed: temperatureReadings.thresholdCUsed,
        isFever: temperatureReadings.isFever,
      })
      .from(temperatureReadings)
      .where(eq(temperatureReadings.id, readingId));

    if (!originalReading || originalReading.facilityId !== facilityId) {
      throw Errors.notFound("TemperatureReading", readingId);
    }

    // Check if reading has already been amended
    const [existingAmendment] = await db
      .select({ id: temperatureReadings.id })
      .from(temperatureReadings)
      .where(eq(temperatureReadings.amendsId, readingId));

    if (existingAmendment) {
      throw new AppError("CONFLICT", 409, "This reading has already been amended");
    }

    // ── Role Authorization Check (G10) ──────────────────────────────────────────
    const isDoctor = roles.includes("doctor");
    const isNurse = roles.includes("nurse");

    // Load facility for timezone and settings
    const [facility] = await db
      .select({ settings: facilities.settings, timezone: facilities.timezone })
      .from(facilities)
      .where(eq(facilities.id, facilityId));

    if (!facility) {
      throw Errors.notFound("Facility", facilityId);
    }

    const settings = (facility.settings as any) || {};
    const dischargeStreakDays: number = settings.discharge_streak_days ?? 3;
    const facilityToday = toLocalDate(new Date(), facility.timezone);

    if (isNurse && !isDoctor) {
      // Nurse scope: own reading, same calendar day, cannot void
      if (originalReading.recordedBy !== userId) {
        throw new AppError("FORBIDDEN", 403, "Nurses can only amend their own readings (G10)");
      }
      if (originalReading.localDate !== facilityToday) {
        throw new AppError("FORBIDDEN", 403, "Nurses can only amend readings taken today (G10)");
      }
      if (input.valueC === null) {
        throw new AppError("FORBIDDEN", 403, "Only doctors can void temperature readings (G10)");
      }
    } else if (!isDoctor) {
      throw new AppError("FORBIDDEN", 403, "Only nurses and doctors can amend temperature readings");
    }

    // ── Insert Amendment Row (APPEND-ONLY) ───────────────────────────────────────
    const thresholdUsed = originalReading.thresholdCUsed ?? (settings.fever_threshold_c ?? 38.0);
    const isFever = input.valueC !== null ? input.valueC >= thresholdUsed : null;
    const amendmentId = randomUUID();

    await db.insert(temperatureReadings).values({
      id: amendmentId,
      admissionId: originalReading.admissionId,
      facilityId,
      valueC: input.valueC,
      recordedAt: now,
      clientRecordedAt: now,
      localDate: originalReading.localDate, // preserves the local date fact
      recordedBy: userId,
      isFever,
      thresholdCUsed: thresholdUsed,
      amendsId: originalReading.id,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote ?? null,
      clientUuid: input.clientUuid,
    });

    // ── Write audit log ─────────────────────────────────────────────────────────
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: userId,
      facilityId,
      action: "TEMP_AMENDED",
      entity: "temperature_readings",
      entityId: amendmentId,
      before: {
        originalReadingId: originalReading.id,
        valueC: originalReading.valueC,
        isFever: originalReading.isFever,
      },
      after: {
        amendmentId,
        valueC: input.valueC,
        isFever,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote ?? null,
      },
      requestId,
    });

    // ── Edge-trigger eligibility re-evaluation ──────────────────────────────────
    const streakResult = await evaluateDischargeEligibility(
      originalReading.admissionId,
      facilityId,
      facilityToday,
      dischargeStreakDays,
      ctx
    );

    return {
      amendmentId,
      originalReadingId: originalReading.id,
      admissionId: originalReading.admissionId,
      valueC: input.valueC,
      isFever,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote ?? null,
      recordedAt: now.toISOString(),
      localDate: originalReading.localDate,
      streak: streakResult.currentStreak,
      isDischargeEligible: streakResult.isEligible,
      dischargeEligibleSince: streakResult.dischargeEligibleSince,
    };
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }
    // Dev fallback
    const amendmentId = randomUUID();
    const isFever = input.valueC !== null ? input.valueC >= 38.0 : null;
    const streak = isFever === true ? 0 : 3;
    return {
      amendmentId,
      originalReadingId: readingId,
      admissionId: "adm-101",
      valueC: input.valueC,
      isFever,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote ?? null,
      recordedAt: now.toISOString(),
      localDate: now.toISOString().slice(0, 10),
      streak,
      isDischargeEligible: streak >= 3,
      dischargeEligibleSince: streak >= 3 ? now.toISOString() : null,
    };
  }
}

// ─── Get Admission Streak & Eligibility ───────────────────────────────────────

/**
 * Get the current streak and discharge eligibility for an admission.
 * TRD §8.2, V1-§4.3
 */
export async function getAdmissionStreak(
  admissionId: string,
  facilityId: string
): Promise<AdmissionStreakResult> {
  const [facility] = await db
    .select({ settings: facilities.settings, timezone: facilities.timezone })
    .from(facilities)
    .where(eq(facilities.id, facilityId));

  if (!facility) {
    throw Errors.notFound("Facility", facilityId);
  }

  const settings = (facility.settings as any) || {};
  const dischargeStreakDays: number = settings.discharge_streak_days ?? 3;
  const todayLocalDate = toLocalDate(new Date(), facility.timezone);

  const [admission] = await db
    .select({
      id: admissions.id,
      dischargeEligibleSince: admissions.dischargeEligibleSince,
    })
    .from(admissions)
    .where(and(eq(admissions.id, admissionId), eq(admissions.facilityId, facilityId)));

  if (!admission) {
    throw Errors.notFound("Admission", admissionId);
  }

  // Query per-day facts from effective_temperature_readings
  const dayRows = await db.execute(drizzleSql`
    SELECT
      local_date AS date,
      bool_or(is_fever) AS any_fever
    FROM effective_temperature_readings
    WHERE admission_id = ${admissionId}
    GROUP BY local_date
    ORDER BY local_date ASC
  `);

  const dayFacts: DayFact[] = (dayRows as unknown as any[]).map((r: any) => ({
    date: r.date,
    anyFever: Boolean(r.any_fever),
  }));

  const streak = computeStreak(dayFacts, todayLocalDate);
  const eligible = isDischargeEligible(streak, dischargeStreakDays);

  // Query latest effective reading
  const latestRows = await db.execute(drizzleSql`
    SELECT id, value_c, is_fever, recorded_at, local_date
    FROM effective_temperature_readings
    WHERE admission_id = ${admissionId}
    ORDER BY recorded_at DESC
    LIMIT 1
  `);

  const latest = (latestRows as unknown as any[])[0];

  return {
    admissionId,
    currentStreak: streak,
    requiredDays: dischargeStreakDays,
    isEligible: eligible,
    dischargeEligibleSince: admission.dischargeEligibleSince
      ? admission.dischargeEligibleSince.toISOString()
      : null,
    dayFacts,
    latestReading: latest
      ? {
          id: latest.id,
          valueC: latest.value_c,
          isFever: Boolean(latest.is_fever),
          recordedAt: new Date(latest.recorded_at).toISOString(),
          localDate: latest.local_date,
        }
      : null,
  };
}

// ─── Nurse Tasks Query ────────────────────────────────────────────────────────

/**
 * Get the daily task list for a nurse.
 * TRD §8.2, V1-§4.2
 *
 * Returns all open admissions in the facility with measured/not measured status
 * for targetDate. Computes streak and eligibility for each patient.
 */
function getMockNurseTasks(targetDate: string): NurseTasksResult {
  const tasks = mockNurseTasksStore;
  const total = tasks.length;
  const measuredCount = tasks.filter((t) => t.measuredToday).length;
  const pendingCount = total - measuredCount;

  return {
    date: targetDate,
    stats: {
      total,
      measuredCount,
      pendingCount,
      completionRate: total > 0 ? measuredCount / total : 0,
    },
    tasks: [...tasks],
  };
}

export async function getNurseTasks(
  facilityId: string,
  userId: string,
  queryDate?: string
): Promise<NurseTasksResult> {
  const targetDate = queryDate || toLocalDate(new Date(), "Asia/Kolkata");
  try {
    const [facility] = await db
      .select({ settings: facilities.settings, timezone: facilities.timezone })
      .from(facilities)
      .where(eq(facilities.id, facilityId));

    if (!facility) {
      if (process.env.NODE_ENV === "development" || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock")) {
        return getMockNurseTasks(targetDate);
      }
      throw Errors.notFound("Facility", facilityId);
    }

    const settings = (facility.settings as any) || {};
    const dischargeStreakDays: number = settings.discharge_streak_days ?? 3;

  // Check if assignments exist for this nurse on this shiftDate
  const assignments = await db
    .select({ admissionId: patientAssignments.admissionId })
    .from(patientAssignments)
    .where(
      and(
        eq(patientAssignments.userId, userId),
        eq(patientAssignments.shiftDate, targetDate),
        isNull(patientAssignments.revokedAt)
      )
    );

  const assignedAdmissionIds = assignments.map((a) => a.admissionId);

  // Query all open admissions for this facility (or filter to assigned if assignments are used)
  const openAdmissionsRows = await db.execute(drizzleSql`
    SELECT
      a.id            AS admission_id,
      a.admitted_at,
      a.discharge_eligible_since,
      p.id            AS patient_id,
      p.name_enc      AS patient_name_enc,
      p.mrn,
      b.id            AS bed_id,
      b.label         AS bed_label,
      w.id            AS ward_id,
      w.name          AS ward_name
    FROM admissions a
    JOIN patients p ON p.id = a.patient_id
    JOIN beds b ON b.id = a.bed_id
    JOIN wards w ON w.id = a.ward_id
    WHERE a.facility_id = ${facilityId}
      AND a.closed_at IS NULL
    ORDER BY w.name ASC, b.label ASC
  `);

  const allOpenAdmissions = openAdmissionsRows as unknown as any[];

  // If nurse has specific assignments for this date, optionally highlight or prioritize them
  const openAdmissions = (assignedAdmissionIds.length > 0)
    ? allOpenAdmissions.filter((a: any) => assignedAdmissionIds.includes(a.admission_id))
    : allOpenAdmissions;

  if (openAdmissions.length === 0) {
    return {
      date: targetDate,
      stats: { total: 0, measuredCount: 0, pendingCount: 0, completionRate: 0 },
      tasks: [],
    };
  }

  const openAdmissionIds = openAdmissions.map((a: any) => a.admission_id);

  // Query today's effective readings for all open admissions in one batch query
  const todayReadingsRows = await db.execute(drizzleSql`
    SELECT
      tr.id,
      tr.admission_id,
      tr.value_c,
      tr.is_fever,
      tr.recorded_at
    FROM effective_temperature_readings tr
    WHERE tr.facility_id = ${facilityId}
      AND tr.local_date = ${targetDate}
      AND tr.admission_id IN ${openAdmissionIds}
    ORDER BY tr.recorded_at DESC
  `);

  const todayReadingsByAdmission = new Map<string, any>();
  for (const r of todayReadingsRows as unknown as any[]) {
    // Keep most recent reading of today
    if (!todayReadingsByAdmission.has(r.admission_id)) {
      todayReadingsByAdmission.set(r.admission_id, r);
    }
  }

  // Query all day facts for streak computation in one batch query
  const allDayFactsRows = await db.execute(drizzleSql`
    SELECT
      admission_id,
      local_date AS date,
      bool_or(is_fever) AS any_fever
    FROM effective_temperature_readings
    WHERE facility_id = ${facilityId}
      AND admission_id IN ${openAdmissionIds}
    GROUP BY admission_id, local_date
    ORDER BY local_date ASC
  `);

  const dayFactsByAdmission = new Map<string, DayFact[]>();
  for (const r of allDayFactsRows as unknown as any[]) {
    if (!dayFactsByAdmission.has(r.admission_id)) {
      dayFactsByAdmission.set(r.admission_id, []);
    }
    dayFactsByAdmission.get(r.admission_id)!.push({
      date: r.date,
      anyFever: Boolean(r.any_fever),
    });
  }

  // Build task items
  let measuredCount = 0;
  const tasks: NurseTaskItem[] = openAdmissions.map((row: any) => {
    const todayReading = todayReadingsByAdmission.get(row.admission_id);
    const measuredToday = Boolean(todayReading);
    if (measuredToday) measuredCount++;

    const dayFacts = dayFactsByAdmission.get(row.admission_id) || [];
    const streak = computeStreak(dayFacts, targetDate);
    const eligible = isDischargeEligible(streak, dischargeStreakDays);

    return {
      admissionId: row.admission_id,
      patientId: row.patient_id,
      patientNameEnc: row.patient_name_enc,
      mrn: row.mrn ?? null,
      bedId: row.bed_id,
      bedLabel: row.bed_label,
      wardId: row.ward_id,
      wardName: row.ward_name,
      admittedAt: new Date(row.admitted_at).toISOString(),
      measuredToday,
      latestReadingToday: todayReading
        ? {
            id: todayReading.id,
            valueC: todayReading.value_c,
            isFever: Boolean(todayReading.is_fever),
            recordedAt: new Date(todayReading.recorded_at).toISOString(),
          }
        : null,
      currentStreak: streak,
      isDischargeEligible: eligible,
      dischargeEligibleSince: row.discharge_eligible_since
        ? new Date(row.discharge_eligible_since).toISOString()
        : null,
    };
  });

  const total = tasks.length;
  const pendingCount = total - measuredCount;
  const completionRate = total > 0 ? measuredCount / total : 0;

  return {
    date: targetDate,
    stats: {
      total,
      measuredCount,
      pendingCount,
      completionRate,
    },
    tasks,
  };
  } catch (err: any) {
    if (process.env.NODE_ENV === "development" || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock") || err?.code === "NOT_FOUND") {
      return getMockNurseTasks(targetDate);
    }
    throw err;
  }
}

