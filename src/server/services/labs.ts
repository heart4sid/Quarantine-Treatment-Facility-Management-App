/**
 * External Lab Integration Service (v2d).
 * TRD §11.5, V2-§4.6, V2-§5.6
 *
 * Requirements:
 * 1. Accepts FHIR R4 Bundles (Observation, DiagnosticReport) and direct resources.
 * 2. Resolves patient via Patient.identifier / subject.identifier -> patients.mrn or identity_hash.
 * 3. Links to active (open) admission if found -> status = "MATCHED".
 * 4. Unmatched or ambiguous results go to lab_results_inbox with status = "PENDING_REVIEW"
 *    for Admin/Doctor reconciliation — never discarded, never guessed (V2-§5.6).
 * 5. Emits guaranteed in-app notification (lab.unmatched) for pending items.
 * 6. Idempotency on (source_id, external_id).
 * 7. Append-only and auditable.
 */

import { db } from "@/db/client";
import {
  labResultsInbox,
  patients,
  admissions,
  auditLog,
} from "@/db/schema";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { emitNotification } from "./notifications";
import { AppError, Errors } from "@/lib/errors";
import type { AuthContext } from "@/server/api/handler";

export interface ParsedFhirLabItem {
  externalId: string;
  testName: string;
  testCode: string | null;
  resultValue: string;
  unit: string | null;
  referenceRange: string | null;
  isAbnormal: boolean;
  patientIdentifierRaw: string | null;
  rawResource: any;
}

export interface IngestLabOptions {
  facilityId: string;
  sourceId: string;
  bundleOrResource: any;
  ctx?: {
    userId?: string;
    requestId?: string;
  };
}

export interface IngestLabResultSummary {
  totalProcessed: number;
  matchedCount: number;
  pendingReviewCount: number;
  duplicateCount: number;
  items: Array<{
    id: string;
    externalId: string;
    status: "MATCHED" | "PENDING_REVIEW" | "DISCARDED";
    resolvedAdmissionId: string | null;
    isDuplicate?: boolean;
  }>;
}

/**
 * Parses a FHIR R4 payload (Bundle, Observation, or DiagnosticReport)
 * into a list of normalized lab items.
 */
export function parseFhirPayload(payload: any): ParsedFhirLabItem[] {
  if (!payload || typeof payload !== "object") {
    throw new AppError("VALIDATION_ERROR", 400, "Invalid FHIR payload: expected JSON object");
  }

  const items: ParsedFhirLabItem[] = [];

  // Case 1: FHIR Bundle
  if (payload.resourceType === "Bundle" && Array.isArray(payload.entry)) {
    // Map bundle-level patient identifiers if present
    let bundlePatientIdentifier: string | null = null;
    for (const entry of payload.entry) {
      if (entry.resource?.resourceType === "Patient") {
        const idObj = entry.resource.identifier?.[0];
        if (idObj?.value) {
          bundlePatientIdentifier = String(idObj.value).trim();
          break;
        }
      }
    }

    for (const entry of payload.entry) {
      const res = entry.resource;
      if (!res) continue;

      if (res.resourceType === "Observation" || res.resourceType === "DiagnosticReport") {
        const item = extractItemFromResource(res, bundlePatientIdentifier);
        if (item) items.push(item);
      }
    }
  }
  // Case 2: Single Observation or DiagnosticReport
  else if (payload.resourceType === "Observation" || payload.resourceType === "DiagnosticReport") {
    const item = extractItemFromResource(payload, null);
    if (item) items.push(item);
  } else {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `Unsupported FHIR resourceType: ${payload.resourceType || "unknown"}. Expected Bundle, Observation, or DiagnosticReport.`
    );
  }

  if (items.length === 0) {
    throw new AppError("VALIDATION_ERROR", 400, "FHIR payload contains no Observation or DiagnosticReport resources");
  }

  return items;
}

function extractItemFromResource(
  res: any,
  fallbackPatientId: string | null
): ParsedFhirLabItem | null {
  const externalId =
    res.id ||
    res.identifier?.[0]?.value ||
    randomUUID();

  // Test name & code
  const codeObj = res.code;
  const coding = Array.isArray(codeObj?.coding) ? codeObj.coding[0] : null;
  const testName =
    codeObj?.text ||
    coding?.display ||
    coding?.code ||
    res.conclusion ||
    "Unknown Test";
  const testCode = coding?.code ? String(coding.code) : null;

  // Result value & unit
  let resultValue = "PENDING";
  let unit: string | null = null;

  if (typeof res.valueString === "string") {
    resultValue = res.valueString;
  } else if (res.valueQuantity && typeof res.valueQuantity.value !== "undefined") {
    resultValue = String(res.valueQuantity.value);
    unit = res.valueQuantity.unit || null;
  } else if (res.valueCodeableConcept) {
    resultValue =
      res.valueCodeableConcept.text ||
      res.valueCodeableConcept.coding?.[0]?.display ||
      res.valueCodeableConcept.coding?.[0]?.code ||
      "DOCUMENTED";
  } else if (typeof res.conclusion === "string") {
    resultValue = res.conclusion;
  }

  // Reference range
  let referenceRange: string | null = null;
  if (Array.isArray(res.referenceRange) && res.referenceRange.length > 0) {
    const rr = res.referenceRange[0];
    if (rr.text) {
      referenceRange = rr.text;
    } else if (rr.low || rr.high) {
      referenceRange = `${rr.low?.value ?? ""} - ${rr.high?.value ?? ""}`.trim();
    }
  }

  // Abnormal flag
  let isAbnormal = false;
  if (Array.isArray(res.interpretation) && res.interpretation.length > 0) {
    const interpCode = res.interpretation[0]?.coding?.[0]?.code?.toUpperCase();
    if (["A", "H", "L", "POS", "DET", "ABNORMAL", "HIGH", "LOW", "POSITIVE"].includes(interpCode)) {
      isAbnormal = true;
    }
  } else {
    const valUpper = resultValue.toUpperCase();
    if (valUpper.includes("POS") || valUpper.includes("DETECTED") || valUpper.includes("ABNORMAL")) {
      isAbnormal = true;
    }
  }

  // Patient identifier
  let patientIdentifierRaw = fallbackPatientId;
  if (res.subject?.identifier?.value) {
    patientIdentifierRaw = String(res.subject.identifier.value).trim();
  } else if (res.subject?.reference) {
    // e.g. "Patient/MRN-12345" or "Patient/12345"
    const ref = String(res.subject.reference);
    const parts = ref.split("/");
    if (parts.length === 2 && parts[0] === "Patient") {
      patientIdentifierRaw = parts[1].trim();
    }
  }

  return {
    externalId: String(externalId),
    testName,
    testCode,
    resultValue,
    unit,
    referenceRange,
    isAbnormal,
    patientIdentifierRaw,
    rawResource: res,
  };
}

/**
 * Ingest FHIR R4 lab results into the facility's inbox or matched admission.
 * Implements TRD §11.5 and V2-§5.6 (never discarded, never guessed).
 */
export async function ingestFhirBundle(
  options: IngestLabOptions
): Promise<IngestLabResultSummary> {
  const { facilityId, sourceId, bundleOrResource, ctx } = options;

  const parsedItems = parseFhirPayload(bundleOrResource);

  const summary: IngestLabResultSummary = {
    totalProcessed: parsedItems.length,
    matchedCount: 0,
    pendingReviewCount: 0,
    duplicateCount: 0,
    items: [],
  };

  for (const item of parsedItems) {
    // 1. Check idempotency on (source_id, external_id)
    const [existing] = await db
      .select({
        id: labResultsInbox.id,
        externalId: labResultsInbox.externalId,
        status: labResultsInbox.status,
        resolvedAdmissionId: labResultsInbox.resolvedAdmissionId,
      })
      .from(labResultsInbox)
      .where(
        and(
          eq(labResultsInbox.sourceId, sourceId),
          eq(labResultsInbox.externalId, item.externalId)
        )
      )
      .limit(1);

    if (existing) {
      summary.duplicateCount++;
      summary.items.push({
        id: existing.id,
        externalId: existing.externalId,
        status: existing.status as any,
        resolvedAdmissionId: existing.resolvedAdmissionId,
        isDuplicate: true,
      });
      continue;
    }

    // 2. Resolve patient & active admission
    let resolvedAdmissionId: string | null = null;
    let status: "MATCHED" | "PENDING_REVIEW" = "PENDING_REVIEW";

    if (item.patientIdentifierRaw) {
      // Find patient by MRN or identityHash
      const matchedPatients = await db
        .select({ id: patients.id })
        .from(patients)
        .where(
          sql`${patients.mrn} = ${item.patientIdentifierRaw} OR ${patients.identityHash} = ${item.patientIdentifierRaw}`
        )
        .limit(2);

      // Only unambiguous single patient match
      if (matchedPatients.length === 1) {
        const patientId = matchedPatients[0].id;

        // Check for an OPEN admission in THIS facility
        const [openAdmission] = await db
          .select({ id: admissions.id })
          .from(admissions)
          .where(
            and(
              eq(admissions.patientId, patientId),
              eq(admissions.facilityId, facilityId),
              isNull(admissions.closedAt)
            )
          )
          .limit(1);

        if (openAdmission) {
          resolvedAdmissionId = openAdmission.id;
          status = "MATCHED";
        }
      }
    }

    // 3. Insert into lab_results_inbox
    const inboxId = randomUUID();
    await db.insert(labResultsInbox).values({
      id: inboxId,
      facilityId,
      sourceId,
      externalId: item.externalId,
      testName: item.testName,
      testCode: item.testCode,
      resultValue: item.resultValue,
      unit: item.unit,
      referenceRange: item.referenceRange,
      isAbnormal: item.isAbnormal,
      patientIdentifierRaw: item.patientIdentifierRaw,
      resolvedAdmissionId,
      status,
      rawFhirBundle: item.rawResource,
    });

    if (status === "MATCHED") {
      summary.matchedCount++;
    } else {
      summary.pendingReviewCount++;

      // Emit guaranteed in-app notification for unmatched results (TRD §10.1 table, §11.5)
      await emitNotification({
        facilityId,
        type: "lab.unmatched",
        title: "Unmatched Lab Result",
        bodySafe: `An external lab result (${item.testName}) requires patient reconciliation.`,
        severity: "WARNING",
        targetRole: "admin_staff",
        dedupeKey: `lab:unmatched:${sourceId}:${item.externalId}`,
      });
    }

    // Audit log
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: ctx?.userId,
      facilityId,
      action: "LAB_RESULT_INGESTED" as any,
      entity: "lab_results_inbox",
      entityId: inboxId,
      after: {
        sourceId,
        externalId: item.externalId,
        status,
        resolvedAdmissionId,
        testName: item.testName,
      },
      requestId: ctx?.requestId,
    });

    summary.items.push({
      id: inboxId,
      externalId: item.externalId,
      status,
      resolvedAdmissionId,
      isDuplicate: false,
    });
  }

  return summary;
}

/**
 * List lab results inbox items for a facility.
 */
export async function getLabInbox(
  facilityId: string,
  options: { status?: "PENDING_REVIEW" | "MATCHED" | "DISCARDED"; limit?: number } = {}
) {
  const { status, limit = 50 } = options;

  let query = db
    .select()
    .from(labResultsInbox)
    .where(
      status
        ? and(eq(labResultsInbox.facilityId, facilityId), eq(labResultsInbox.status, status))
        : eq(labResultsInbox.facilityId, facilityId)
    )
    .orderBy(desc(labResultsInbox.receivedAt))
    .limit(limit);

  return await query;
}

/**
 * Manually reconcile an unmatched lab result to an active admission.
 * (TRD §11.5, V2-§5.6)
 */
export async function reconcileLabResult(
  inboxId: string,
  admissionId: string,
  ctx: AuthContext
) {
  const { facilityId, userId, requestId } = ctx;

  const [inboxItem] = await db
    .select()
    .from(labResultsInbox)
    .where(and(eq(labResultsInbox.id, inboxId), eq(labResultsInbox.facilityId, facilityId)));

  if (!inboxItem) {
    throw Errors.notFound("LabResultInbox", inboxId);
  }

  // Verify admission belongs to this facility and is open
  const [admission] = await db
    .select({ id: admissions.id, closedAt: admissions.closedAt })
    .from(admissions)
    .where(and(eq(admissions.id, admissionId), eq(admissions.facilityId, facilityId)));

  if (!admission) {
    throw Errors.notFound("Admission", admissionId);
  }

  if (admission.closedAt) {
    throw new AppError(
      "CONFLICT",
      409,
      "Cannot reconcile lab results to a closed admission"
    );
  }

  // Update inbox row
  await db
    .update(labResultsInbox)
    .set({
      resolvedAdmissionId: admissionId,
      status: "MATCHED",
    })
    .where(eq(labResultsInbox.id, inboxId));

  // Audit
  await db.insert(auditLog).values({
    id: randomUUID(),
    actorUserId: userId,
    facilityId,
    action: "LAB_RESULT_RECONCILED" as any,
    entity: "lab_results_inbox",
    entityId: inboxId,
    before: { status: inboxItem.status, resolvedAdmissionId: inboxItem.resolvedAdmissionId },
    after: { status: "MATCHED", resolvedAdmissionId: admissionId },
    requestId,
  });

  return { success: true, inboxId, admissionId, status: "MATCHED" };
}

/**
 * Discard an unmatched lab result with a documented reason.
 */
export async function discardLabResult(
  inboxId: string,
  reason: string,
  ctx: AuthContext
) {
  const { facilityId, userId, requestId } = ctx;

  const [inboxItem] = await db
    .select()
    .from(labResultsInbox)
    .where(and(eq(labResultsInbox.id, inboxId), eq(labResultsInbox.facilityId, facilityId)));

  if (!inboxItem) {
    throw Errors.notFound("LabResultInbox", inboxId);
  }

  await db
    .update(labResultsInbox)
    .set({
      status: "DISCARDED",
    })
    .where(eq(labResultsInbox.id, inboxId));

  await db.insert(auditLog).values({
    id: randomUUID(),
    actorUserId: userId,
    facilityId,
    action: "LAB_RESULT_DISCARDED" as any,
    entity: "lab_results_inbox",
    entityId: inboxId,
    before: { status: inboxItem.status },
    after: { status: "DISCARDED", reason },
    requestId,
  });

  return { success: true, inboxId, status: "DISCARDED" };
}
