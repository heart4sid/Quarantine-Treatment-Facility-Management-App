/**
 * Treatment & Medication Service (v2b).
 * TRD §11.1, V2-§4.2, V2-§5.2
 *
 * Requirements:
 * - Doctors create treatment plans and versioned medication orders
 * - Optional Pharmacist verification before order activation (configurable per facility)
 * - Materialized med_slots for a 72-hour rolling horizon
 * - Conflict detection on slot generation (flag only — never block or auto-resolve)
 * - Derived overdue status (now > window_end AND no administration)
 * - Append-only administration log (ADMINISTERED / MISSED / REFUSED) by Nurse
 */

import { db } from "@/db/client";
import {
  treatmentPlans,
  medicationOrders,
  medSlots,
  medAdministrations,
  admissions,
  facilities,
  auditLog,
} from "@/db/schema";
import { eq, and, isNull, sql, desc, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { AppError, Errors } from "@/lib/errors";
import { emitNotification } from "./notifications";
import type { AuthContext } from "@/server/api/handler";

export interface CreateMedOrderInput {
  drugName: string;
  code?: string;
  dose: string;
  unit: string;
  route: string; // "ORAL" | "IV" | "IM" | "INHALED"
  frequencySpec: {
    timesPerDay: number;
    hours: number[]; // e.g. [8, 14, 20]
  };
  durationDays?: number;
}

export interface CreateTreatmentPlanInput {
  diagnosisNotes?: string;
  orders: CreateMedOrderInput[];
}

export interface AdministerMedInput {
  status: "ADMINISTERED" | "MISSED" | "REFUSED";
  notes?: string;
  clientUuid: string;
}

/**
 * Generate med_slots for an active medication order across a 72-hour rolling horizon (TRD §11.1).
 */
export async function generateSlotsForOrder(
  orderId: string,
  admissionId: string,
  facilityId: string,
  frequencySpec: { timesPerDay: number; hours: number[] },
  durationDays = 3
) {
  const now = new Date();
  const slotsToInsert: Array<{
    id: string;
    orderId: string;
    facilityId: string;
    admissionId: string;
    dueAt: Date;
    windowEnd: Date;
    status: string;
    conflictFlag: boolean;
  }> = [];

  const hours = frequencySpec.hours && frequencySpec.hours.length > 0 ? frequencySpec.hours : [9, 21];

  // Generate slots for next 3 days (72 hours)
  for (let dayOffset = 0; dayOffset < durationDays; dayOffset++) {
    for (const hour of hours) {
      const dueAt = new Date(now);
      dueAt.setDate(now.getDate() + dayOffset);
      dueAt.setHours(hour, 0, 0, 0);

      // Only generate future slots or slots within last 2 hours
      if (dueAt.getTime() < now.getTime() - 2 * 60 * 60 * 1000) {
        continue;
      }

      // Slot window end is 2 hours after due time
      const windowEnd = new Date(dueAt.getTime() + 2 * 60 * 60 * 1000);

      // Check for overlapping window conflicts for the same admission (TRD §11.1, V2 §5.2)
      const [existingConflict] = await db
        .select({ id: medSlots.id })
        .from(medSlots)
        .where(
          and(
            eq(medSlots.admissionId, admissionId),
            gte(medSlots.dueAt, new Date(dueAt.getTime() - 30 * 60 * 1000)),
            lte(medSlots.dueAt, new Date(dueAt.getTime() + 30 * 60 * 1000))
          )
        )
        .limit(1);

      slotsToInsert.push({
        id: randomUUID(),
        orderId,
        facilityId,
        admissionId,
        dueAt,
        windowEnd,
        status: "SCHEDULED",
        conflictFlag: Boolean(existingConflict), // Flag only — never block
      });
    }
  }

  for (const s of slotsToInsert) {
    await db.insert(medSlots).values(s);
  }

  return slotsToInsert.length;
}

/**
 * Doctor creates a treatment plan with medication orders (TRD §11.1).
 */
export async function createTreatmentPlan(
  admissionId: string,
  input: CreateTreatmentPlanInput,
  ctx: AuthContext
) {
  const { facilityId, userId, requestId } = ctx;

  // 1. Verify admission is open
  const [admission] = await db
    .select({ id: admissions.id, facilityId: admissions.facilityId, closedAt: admissions.closedAt })
    .from(admissions)
    .where(eq(admissions.id, admissionId));

  if (!admission || admission.facilityId !== facilityId) {
    throw Errors.notFound("Admission", admissionId);
  }

  if (admission.closedAt) {
    throw new AppError("CONFLICT", 409, "Cannot prescribe medication for a closed admission");
  }

  // 2. Check facility settings for pharmacist verification requirement
  const [facility] = await db
    .select({ settings: facilities.settings })
    .from(facilities)
    .where(eq(facilities.id, facilityId));

  const settings = (facility?.settings as any) || {};
  const requirePharmacist: boolean = settings.require_pharmacist_verification ?? false;

  const planId = randomUUID();

  // 3. Insert treatment plan
  await db.insert(treatmentPlans).values({
    id: planId,
    admissionId,
    facilityId,
    doctorId: userId,
    status: "ACTIVE",
    version: 1,
    diagnosisNotes: input.diagnosisNotes,
  });

  const createdOrderIds: string[] = [];

  // 4. Insert medication orders
  for (const o of input.orders) {
    const orderId = randomUUID();
    const orderStatus = requirePharmacist ? "PENDING_VERIFICATION" : "ACTIVE";

    await db.insert(medicationOrders).values({
      id: orderId,
      planId,
      facilityId,
      drugName: o.drugName,
      code: o.code,
      dose: o.dose,
      unit: o.unit,
      route: o.route,
      frequencySpec: o.frequencySpec,
      startAt: new Date(),
      status: orderStatus,
      verifiedBy: requirePharmacist ? null : userId,
      verifiedAt: requirePharmacist ? null : new Date(),
    });

    createdOrderIds.push(orderId);

    // If active immediately, generate slots
    if (orderStatus === "ACTIVE") {
      await generateSlotsForOrder(orderId, admissionId, facilityId, o.frequencySpec);
    }
  }

  // 5. Audit log
  await db.insert(auditLog).values({
    id: randomUUID(),
    actorUserId: userId,
    facilityId,
    action: "TREATMENT_PLAN_CREATED" as any,
    entity: "treatment_plans",
    entityId: planId,
    after: { orderCount: input.orders.length, requirePharmacist },
    requestId,
  });

  // 6. Notify Pharmacist if verification required
  if (requirePharmacist) {
    await emitNotification({
      facilityId,
      type: "order.pending_verification",
      title: "Medication Order Pending Verification",
      bodySafe: `New prescription requires pharmacist verification for inpatient admission`,
      severity: "WARNING",
      targetRole: "pharmacist",
      admissionId,
    });
  }

  return { planId, orderIds: createdOrderIds, requirePharmacist };
}

/**
 * Pharmacist verifies an order, moving it to ACTIVE and generating slots (TRD §11.1).
 */
export async function verifyMedicationOrder(orderId: string, ctx: AuthContext) {
  const { facilityId, userId, requestId } = ctx;

  const [order] = await db
    .select({
      id: medicationOrders.id,
      planId: medicationOrders.planId,
      status: medicationOrders.status,
      frequencySpec: medicationOrders.frequencySpec,
    })
    .from(medicationOrders)
    .where(and(eq(medicationOrders.id, orderId), eq(medicationOrders.facilityId, facilityId)));

  if (!order) {
    throw Errors.notFound("MedicationOrder", orderId);
  }

  if (order.status !== "PENDING_VERIFICATION") {
    throw new AppError("CONFLICT", 409, `Order is already in ${order.status} state`);
  }

  const [plan] = await db
    .select({ admissionId: treatmentPlans.admissionId })
    .from(treatmentPlans)
    .where(eq(treatmentPlans.id, order.planId));

  const now = new Date();

  await db
    .update(medicationOrders)
    .set({
      status: "ACTIVE",
      verifiedBy: userId,
      verifiedAt: now,
    })
    .where(eq(medicationOrders.id, orderId));

  // Generate slots upon activation
  if (plan) {
    await generateSlotsForOrder(
      order.id,
      plan.admissionId,
      facilityId,
      order.frequencySpec as any
    );
  }

  // Audit
  await db.insert(auditLog).values({
    id: randomUUID(),
    actorUserId: userId,
    facilityId,
    action: "MED_ORDER_VERIFIED" as any,
    entity: "medication_orders",
    entityId: orderId,
    after: { verifiedBy: userId, verifiedAt: now.toISOString() },
    requestId,
  });

  return { success: true, orderId };
}

/**
 * Get Medication Administration Record (MAR) for a patient.
 */
export async function getPatientMar(admissionId: string, facilityId: string) {
  const plans = await db
    .select({
      id: treatmentPlans.id,
      status: treatmentPlans.status,
      version: treatmentPlans.version,
      diagnosisNotes: treatmentPlans.diagnosisNotes,
      createdAt: treatmentPlans.createdAt,
    })
    .from(treatmentPlans)
    .where(and(eq(treatmentPlans.admissionId, admissionId), eq(treatmentPlans.facilityId, facilityId)))
    .orderBy(desc(treatmentPlans.createdAt));

  const orders = await db
    .select({
      id: medicationOrders.id,
      planId: medicationOrders.planId,
      drugName: medicationOrders.drugName,
      dose: medicationOrders.dose,
      unit: medicationOrders.unit,
      route: medicationOrders.route,
      frequencySpec: medicationOrders.frequencySpec,
      status: medicationOrders.status,
      startAt: medicationOrders.startAt,
    })
    .from(medicationOrders)
    .where(eq(medicationOrders.facilityId, facilityId));

  const slots = await db
    .select({
      id: medSlots.id,
      orderId: medSlots.orderId,
      dueAt: medSlots.dueAt,
      windowEnd: medSlots.windowEnd,
      status: medSlots.status,
      conflictFlag: medSlots.conflictFlag,
    })
    .from(medSlots)
    .where(and(eq(medSlots.admissionId, admissionId), eq(medSlots.facilityId, facilityId)))
    .orderBy(medSlots.dueAt);

  const now = new Date();

  const formattedSlots = slots.map((s) => {
    const isOverdue = now > s.windowEnd && s.status === "SCHEDULED";
    return {
      ...s,
      dueAt: s.dueAt.toISOString(),
      windowEnd: s.windowEnd.toISOString(),
      isOverdue,
    };
  });

  return {
    plans,
    orders,
    slots: formattedSlots,
  };
}

/**
 * Nurse administers, marks missed, or records refusal for a scheduled slot (TRD §11.1).
 */
export async function administerMedication(
  slotId: string,
  input: AdministerMedInput,
  ctx: AuthContext
) {
  const { facilityId, userId, requestId } = ctx;

  const [slot] = await db
    .select({
      id: medSlots.id,
      admissionId: medSlots.admissionId,
      orderId: medSlots.orderId,
      status: medSlots.status,
    })
    .from(medSlots)
    .where(and(eq(medSlots.id, slotId), eq(medSlots.facilityId, facilityId)));

  if (!slot) {
    throw Errors.notFound("MedSlot", slotId);
  }

  // Check idempotency via clientUuid
  const [existingAdmin] = await db
    .select({ id: medAdministrations.id })
    .from(medAdministrations)
    .where(eq(medAdministrations.clientUuid, input.clientUuid));

  if (existingAdmin) {
    return { id: existingAdmin.id, slotId, status: input.status, duplicate: true };
  }

  const adminId = randomUUID();
  const now = new Date();

  // 1. Insert administration log (append-only)
  await db.insert(medAdministrations).values({
    id: adminId,
    slotId,
    facilityId,
    status: input.status,
    byUser: userId,
    administeredAt: now,
    notes: input.notes,
    clientUuid: input.clientUuid,
  });

  // 2. Update slot status
  await db
    .update(medSlots)
    .set({
      status: input.status,
    })
    .where(eq(medSlots.id, slotId));

  // 3. Audit log
  await db.insert(auditLog).values({
    id: randomUUID(),
    actorUserId: userId,
    facilityId,
    action: "MED_ADMINISTERED" as any,
    entity: "med_administrations",
    entityId: adminId,
    after: { slotId, status: input.status, byUser: userId },
    requestId,
  });

  return { id: adminId, slotId, status: input.status, duplicate: false };
}
