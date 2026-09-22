/**
 * POST /api/v1/admissions    — Admit a patient (with waitlist fallback)
 * GET  /api/v1/admissions    — List admissions for the facility
 * TRD §6.1, V1-§4.1, V2-§4.1
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { admitPatient, getBedStatuses, getWaitlist } from "@/server/services/admissions";
import { admitPatientSchema, admissionsQuerySchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";
import { db } from "@/db/client";
import { admissions, beds, wards, patients } from "@/db/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";

// ─── POST /api/v1/admissions ──────────────────────────────────────────────────

export const POST = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "admission:create");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.validationError([{ message: "Invalid JSON body" }]);
  }

  const parse = admitPatientSchema.safeParse(body);
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await admitPatient(parse.data, ctx);

  return NextResponse.json(
    {
      admissionId: result.admissionId,
      patientId: result.patientId,
      bedLabel: result.bedLabel,
      wardId: result.wardId,
      admittedAt: result.admittedAt,
      isReadmission: result.isReadmission,
    },
    { status: 201 }
  );
});

// ─── GET /api/v1/admissions ───────────────────────────────────────────────────

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "admission:view");

  const { searchParams } = req.nextUrl;
  const queryParse = admissionsQuerySchema.safeParse({
    status: searchParams.get("status") ?? "open",
    wardId: searchParams.get("wardId") ?? undefined,
    limit: searchParams.get("limit") ?? "50",
    offset: searchParams.get("offset") ?? "0",
  });

  if (!queryParse.success) {
    throw Errors.validationError(queryParse.error.issues);
  }

  const { status, wardId, limit, offset } = queryParse.data;
  const { facilityId } = ctx;

  const rows = await db
    .select({
      admissionId: admissions.id,
      patientId: admissions.patientId,
      bedId: admissions.bedId,
      wardId: admissions.wardId,
      bedLabel: beds.label,
      wardName: wards.name,
      admittedAt: admissions.admittedAt,
      closedAt: admissions.closedAt,
      outcome: admissions.outcome,
      dischargeEligibleSince: admissions.dischargeEligibleSince,
      // Encrypted name — client must decrypt with facility key
      patientNameEnc: patients.nameEnc,
    })
    .from(admissions)
    .innerJoin(beds, eq(beds.id, admissions.bedId))
    .innerJoin(wards, eq(wards.id, admissions.wardId))
    .innerJoin(patients, eq(patients.id, admissions.patientId))
    .where(
      and(
        eq(admissions.facilityId, facilityId),
        status === "open"
          ? isNull(admissions.closedAt)
          : status === "closed"
          ? isNotNull(admissions.closedAt)
          : // "eligible" — open with a dischargeEligibleSince set
            and(isNull(admissions.closedAt), isNotNull(admissions.dischargeEligibleSince)),
        wardId ? eq(admissions.wardId, wardId) : undefined
      )
    )
    .orderBy(desc(admissions.admittedAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    data: rows,
    meta: { limit, offset, facilityId },
  });
});
