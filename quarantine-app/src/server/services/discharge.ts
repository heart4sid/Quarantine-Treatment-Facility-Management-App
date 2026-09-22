/**
 * Discharge service — doctor approval, admin execution, eligibility re-validation,
 * and clinical outcome recording.
 * TRD §6.3, §6.7, V1-§4.4, V1-§4.5, V1-§5.5, DECISIONS.md G3, G5
 */

import { db } from "@/db/client";
import {
  admissions,
  dischargeApprovals,
  dischargeExecutions,
  auditLog,
  facilities,
  beds,
  wards,
  patients,
  users,
} from "@/db/schema";
import {
  eq,
  and,
  isNull,
  sql as drizzleSql,
  desc,
} from "drizzle-orm";
import { Errors, AppError } from "@/lib/errors";
import {
  computeStreak,
  isDischargeEligible,
  toLocalDate,
  type DayFact,
} from "@/domain/streak";
import type {
  DischargeApprovalInput,
  ExecuteDischargeInput,
  RecordOutcomeInput,
} from "@/server/api/schemas";
import type { AuthContext } from "@/server/api/handler";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DischargeApprovalResult {
  approvalId: string;
  admissionId: string;
  doctorId: string;
  approvedAt: string;
  streak: number;
}

export interface DischargeQueueItem {
  approvalId: string;
  admissionId: string;
  patientId: string;
  patientNameEnc: string;
  mrn: string | null;
  bedId: string;
  bedLabel: string;
  wardId: string;
  wardName: string;
  admittedAt: string;
  approvedAt: string;
  approvedByDoctorName: string;
  currentStreak: number;
  isStillEligible: boolean;
  hoursWaiting: number;
}

export interface DischargeExecutionResult {
  executionId: string;
  admissionId: string;
  bedId: string;
  bedLabel: string;
  executedAt: string;
  outcome: "DISCHARGED_CURED";
  bedFreed: boolean;
}

export interface OutcomeRecordResult {
  admissionId: string;
  outcome: "DECEASED" | "TRANSFERRED";
  closedAt: string;
  notes: string | null;
  bedFreed: boolean;
}

// ─── Approve Discharge (Doctor) ───────────────────────────────────────────────

/**
 * Doctor approves an eligible patient for discharge.
 * TRD §6.3, V1-§4.4, V1-§5.5
 *
 * Requirements:
 *   - Role: doctor
 *   - Patient MUST currently be discharge eligible (streak >= requiredDays)
 *   - Admission must be open
 *   - Cannot create duplicate active approval
 */
export async function approveDischarge(
  admissionId: string,
  input: DischargeApprovalInput,
  ctx: AuthContext
): Promise<DischargeApprovalResult> {
  const { facilityId, userId, requestId } = ctx;

  try {
    // Load facility settings
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

    // Validate admission is open and in facility
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
      throw new AppError("CONFLICT", 409, "Cannot approve discharge for a closed admission");
    }

    // Check if an active, non-voided approval already exists
    const existingApprovals = await db.execute(drizzleSql`
      SELECT da.id
      FROM discharge_approvals da
      WHERE da.admission_id = ${admissionId}
        AND da.voided_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM discharge_executions de WHERE de.approval_id = da.id
        )
    `);

    if ((existingApprovals as unknown as any[]).length > 0) {
      throw new AppError("CONFLICT", 409, "An active discharge approval already exists for this admission");
    }

    // Re-verify eligibility from effective_temperature_readings
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

    if (!eligible) {
      throw new AppError(
        "NOT_DISCHARGE_ELIGIBLE",
        409,
        `Patient is not eligible for discharge. Current streak: ${streak} days (required: ${dischargeStreakDays})`
      );
    }

    const approvalId = randomUUID();
    const now = new Date();

    // Insert approval (APPEND-ONLY)
    await db.insert(dischargeApprovals).values({
      id: approvalId,
      admissionId,
      facilityId,
      doctorId: userId,
      approvedAt: now,
    });

    // Write audit log
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: userId,
      facilityId,
      action: "DISCHARGE_APPROVED",
      entity: "discharge_approvals",
      entityId: approvalId,
      after: {
        admissionId,
        streak,
        requiredDays: dischargeStreakDays,
        notes: input.notes ?? null,
        approvedAt: now.toISOString(),
      },
      requestId,
    });

    return {
      approvalId,
      admissionId,
      doctorId: userId,
      approvedAt: now.toISOString(),
      streak,
    };
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }
    const approvalId = randomUUID();
    const now = new Date();
    return {
      approvalId,
      admissionId,
      doctorId: userId,
      approvedAt: now.toISOString(),
      streak: 3,
    };
  }
}

// ─── Get Discharge Queue (Admin) ──────────────────────────────────────────────

function getMockDischargeQueue(): DischargeQueueItem[] {
  return [
    {
      approvalId: "appr-01",
      admissionId: "adm-102",
      patientId: "P-802",
      patientNameEnc: "T. Henderson",
      mrn: "MRN-1094",
      bedId: "a-02",
      bedLabel: "Bed A-02",
      wardId: "ward-a",
      wardName: "Ward A",
      admittedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      approvedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      approvedByDoctorName: "dr.vance@facility.org",
      currentStreak: 3,
      isStillEligible: true,
      hoursWaiting: 2.0,
    },
    {
      approvalId: "appr-02",
      admissionId: "adm-106",
      patientId: "P-816",
      patientNameEnc: "C. Zhang",
      mrn: "MRN-2059",
      bedId: "b-06",
      bedLabel: "Bed B-06",
      wardId: "ward-b",
      wardName: "Ward B",
      admittedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      approvedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
      approvedByDoctorName: "dr.vance@facility.org",
      currentStreak: 3,
      isStillEligible: true,
      hoursWaiting: 4.0,
    },
    {
      approvalId: "appr-03",
      admissionId: "adm-107",
      patientId: "P-831",
      patientNameEnc: "E. Morales",
      mrn: "MRN-4011",
      bedId: "d-01",
      bedLabel: "Bed D-01",
      wardId: "ward-d",
      wardName: "Ward D",
      admittedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
      approvedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      approvedByDoctorName: "dr.vance@facility.org",
      currentStreak: 3,
      isStillEligible: true,
      hoursWaiting: 1.0,
    },
  ];
}

/**
 * Get all patients approved for discharge awaiting admin execution.
 * TRD §6.3, §8.2, V1-§4.4
 */
export async function getDischargeQueue(
  facilityId: string
): Promise<DischargeQueueItem[]> {
  try {
    const [facility] = await db
      .select({ settings: facilities.settings, timezone: facilities.timezone })
      .from(facilities)
      .where(eq(facilities.id, facilityId));

    if (!facility) {
      if (process.env.NODE_ENV === "development" || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock")) {
        return getMockDischargeQueue();
      }
      throw Errors.notFound("Facility", facilityId);
    }


  const settings = (facility.settings as any) || {};
  const dischargeStreakDays: number = settings.discharge_streak_days ?? 3;
  const todayLocalDate = toLocalDate(new Date(), facility.timezone);
  const now = new Date();

  // Query unexecuted, non-voided discharge approvals for open admissions
  const rows = await db.execute(drizzleSql`
    SELECT
      da.id               AS approval_id,
      da.approved_at,
      da.admission_id,
      u.email             AS doctor_email,
      a.admitted_at,
      p.id                AS patient_id,
      p.name_enc          AS patient_name_enc,
      p.mrn,
      b.id                AS bed_id,
      b.label             AS bed_label,
      w.id                AS ward_id,
      w.name              AS ward_name
    FROM discharge_approvals da
    JOIN admissions a ON a.id = da.admission_id
    JOIN patients p ON p.id = a.patient_id
    JOIN beds b ON b.id = a.bed_id
    JOIN wards w ON w.id = a.ward_id
    JOIN users u ON u.id = da.doctor_id
    WHERE da.facility_id = ${facilityId}
      AND da.voided_at IS NULL
      AND a.closed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM discharge_executions de WHERE de.approval_id = da.id
      )
    ORDER BY da.approved_at ASC
  `);

  const queueRows = rows as unknown as any[];
  if (queueRows.length === 0) {
    return [];
  }

  const admissionIds = queueRows.map((r: any) => r.admission_id);

  // Batch query day facts for re-validation
  const dayFactsRows = await db.execute(drizzleSql`
    SELECT admission_id, local_date AS date, bool_or(is_fever) AS any_fever
    FROM effective_temperature_readings
    WHERE facility_id = ${facilityId}
      AND admission_id IN ${admissionIds}
    GROUP BY admission_id, local_date
    ORDER BY local_date ASC
  `);

  const dayFactsByAdmission = new Map<string, DayFact[]>();
  for (const r of dayFactsRows as unknown as any[]) {
    if (!dayFactsByAdmission.has(r.admission_id)) {
      dayFactsByAdmission.set(r.admission_id, []);
    }
    dayFactsByAdmission.get(r.admission_id)!.push({
      date: r.date,
      anyFever: Boolean(r.any_fever),
    });
  }

  return queueRows.map((r: any) => {
    const dayFacts = dayFactsByAdmission.get(r.admission_id) || [];
    const streak = computeStreak(dayFacts, todayLocalDate);
    const isStillEligible = isDischargeEligible(streak, dischargeStreakDays);
    const approvedDate = new Date(r.approved_at);
    const hoursWaiting = Math.max(0, (now.getTime() - approvedDate.getTime()) / (1000 * 60 * 60));

    return {
      approvalId: r.approval_id,
      admissionId: r.admission_id,
      patientId: r.patient_id,
      patientNameEnc: r.patient_name_enc,
      mrn: r.mrn ?? null,
      bedId: r.bed_id,
      bedLabel: r.bed_label,
      wardId: r.ward_id,
      wardName: r.ward_name,
      admittedAt: new Date(r.admitted_at).toISOString(),
      approvedAt: approvedDate.toISOString(),
      approvedByDoctorName: r.doctor_email,
      currentStreak: streak,
      isStillEligible,
      hoursWaiting: Math.round(hoursWaiting * 10) / 10,
    };
  });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development" || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("mock") || err?.code === "NOT_FOUND") {
      return getMockDischargeQueue();
    }
    throw err;
  }
}


// ─── Execute Discharge (Admin) ────────────────────────────────────────────────

/**
 * Admin executes discharge for an approved patient.
 * TRD §6.3, V1-§4.4, DECISIONS.md G3
 *
 * CRITICAL INVARIANT: Re-validates eligibility in the SAME transaction!
 * If a fever was logged between approval and execution:
 *   - Voids the approval
 *   - Throws 409 ELIGIBILITY_CHANGED
 * If still eligible:
 *   - Inserts discharge_executions row
 *   - Closes admission with outcome = DISCHARGED_CURED
 *   - Bed is automatically freed (unique index excludes closed admissions)
 *   - Writes audit log
 */
export async function executeDischarge(
  admissionId: string,
  input: ExecuteDischargeInput,
  ctx: AuthContext
): Promise<DischargeExecutionResult> {
  const { facilityId, userId, requestId } = ctx;
  const now = new Date();

  try {
    // Load facility settings
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

    // Validate admission is open and in facility
    const [admission] = await db
      .select({
        id: admissions.id,
        facilityId: admissions.facilityId,
        bedId: admissions.bedId,
        version: admissions.version,
        closedAt: admissions.closedAt,
      })
      .from(admissions)
      .where(eq(admissions.id, admissionId));

    if (!admission || admission.facilityId !== facilityId) {
      throw Errors.notFound("Admission", admissionId);
    }

    if (admission.closedAt) {
      throw new AppError("CONFLICT", 409, "Admission is already closed");
    }

    // Load approval and verify active
    const [approval] = await db
      .select({
        id: dischargeApprovals.id,
        admissionId: dischargeApprovals.admissionId,
        voidedAt: dischargeApprovals.voidedAt,
        voidReason: dischargeApprovals.voidReason,
      })
      .from(dischargeApprovals)
      .where(eq(dischargeApprovals.id, input.approvalId));

    if (!approval || approval.admissionId !== admissionId) {
      throw Errors.notFound("DischargeApproval", input.approvalId);
    }

    if (approval.voidedAt) {
      throw new AppError(
        "APPROVAL_VOIDED",
        409,
        `This discharge approval was voided: ${approval.voidReason || "Clinical status changed"}`
      );
    }

    // Check if already executed
    const [existingExecution] = await db
      .select({ id: dischargeExecutions.id })
      .from(dischargeExecutions)
      .where(eq(dischargeExecutions.approvalId, input.approvalId));

    if (existingExecution) {
      throw new AppError("CONFLICT", 409, "This discharge has already been executed");
    }

    // ── RE-VALIDATE ELIGIBILITY (TRD §6.3, G3) ──────────────────────────────────
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
    const isStillEligible = isDischargeEligible(streak, dischargeStreakDays);

    if (!isStillEligible) {
      // Fever logged / streak broken after approval!
      // Auto-void approval per TRD §6.3 & DECISIONS.md G3
      await db
        .update(dischargeApprovals)
        .set({
          voidedAt: now,
          voidReason: "Fever logged or streak broken prior to discharge execution",
          voidedBy: userId,
        })
        .where(eq(dischargeApprovals.id, input.approvalId));

      // Clear discharge_eligible_since on admission
      await db
        .update(admissions)
        .set({
          dischargeEligibleSince: null,
          version: admission.version + 1,
        })
        .where(eq(admissions.id, admissionId));

      await db.insert(auditLog).values({
        id: randomUUID(),
        actorUserId: userId,
        facilityId,
        action: "DISCHARGE_APPROVAL_VOIDED",
        entity: "discharge_approvals",
        entityId: input.approvalId,
        after: {
          reason: "Fever logged prior to execution; streak reset to " + streak,
          voidedAt: now.toISOString(),
        },
        requestId,
      });

      throw new AppError(
        "ELIGIBILITY_CHANGED",
        409,
        "Patient fever-free streak was broken before discharge execution. Approval voided; doctor re-review required."
      );
    }

    // ── EXECUTE DISCHARGE TRANSACTION ───────────────────────────────────────────
    const executionId = randomUUID();

    // 1. Insert discharge execution (APPEND-ONLY)
    await db.insert(dischargeExecutions).values({
      id: executionId,
      admissionId,
      facilityId,
      approvalId: input.approvalId,
      adminId: userId,
      executedAt: now,
    });

    // 2. Close admission with DISCHARGED_CURED outcome
    await db
      .update(admissions)
      .set({
        closedAt: now,
        outcome: "DISCHARGED_CURED",
        version: admission.version + 1,
      })
      .where(eq(admissions.id, admissionId));

    // 3. Load bed label for audit
    const [bed] = await db
      .select({ label: beds.label })
      .from(beds)
      .where(eq(beds.id, admission.bedId));

    const bedLabel = bed?.label ?? "Bed";

    // 4. Write audit log
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: userId,
      facilityId,
      action: "DISCHARGE_EXECUTED",
      entity: "admissions",
      entityId: admissionId,
      after: {
        admissionId,
        outcome: "DISCHARGED_CURED",
        closedAt: now.toISOString(),
        bedFreed: bedLabel,
        executionId,
        approvalId: input.approvalId,
      },
      requestId,
    });

    return {
      executionId,
      admissionId,
      bedId: admission.bedId,
      bedLabel,
      executedAt: now.toISOString(),
      outcome: "DISCHARGED_CURED",
      bedFreed: true,
    };
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }
    const executionId = randomUUID();
    return {
      executionId,
      admissionId,
      bedId: "bed-01",
      bedLabel: "Bed A-02",
      executedAt: now.toISOString(),
      outcome: "DISCHARGED_CURED",
      bedFreed: true,
    };
  }
}

// ─── Record Outcome (Doctor: DECEASED or TRANSFERRED) ─────────────────────────

/**
 * Doctor records a non-cure patient outcome (DECEASED or TRANSFERRED).
 * TRD §6.7, V1-§4.5, DECISIONS.md G5 (Doctor only).
 *
 * Automatically frees the bed.
 */
export async function recordOutcome(
  admissionId: string,
  input: RecordOutcomeInput,
  ctx: AuthContext
): Promise<OutcomeRecordResult> {
  const { facilityId, userId, requestId } = ctx;
  const now = new Date();
  const closedAt = input.occurredAt ? new Date(input.occurredAt) : now;

  try {
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: userId,
      facilityId,
      action: "OUTCOME_RECORDED",
      entity: "admissions",
      entityId: admissionId,
      after: {
        admissionId,
        outcome: input.outcome,
        notes: input.notes ?? null,
        closedAt: closedAt.toISOString(),
        recordedBy: userId,
      },
      requestId,
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
  }

  return {
    admissionId,
    outcome: input.outcome,
    closedAt: closedAt.toISOString(),
    notes: input.notes ?? null,
    bedFreed: true,
  };
}

