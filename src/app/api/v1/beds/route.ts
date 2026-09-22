/**
 * GET  /api/v1/beds    — List beds with occupancy status
 * TRD §6.1, V1-§5.2
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { getBedStatuses, getFacilityCapacity } from "@/server/services/admissions";
import { bedQuerySchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

// ─── GET /api/v1/beds ─────────────────────────────────────────────────────────

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "bed:view");

  const { searchParams } = req.nextUrl;
  const queryParse = bedQuerySchema.safeParse({
    wardId: searchParams.get("wardId") ?? undefined,
    available: searchParams.get("available") ?? undefined,
  });

  if (!queryParse.success) {
    throw Errors.validationError(queryParse.error.issues);
  }

  const { wardId, available } = queryParse.data;
  const { facilityId } = ctx;

  const [bedStatuses, capacity] = await Promise.all([
    getBedStatuses(facilityId, wardId),
    getFacilityCapacity(facilityId),
  ]);

  const filteredBeds =
    available !== undefined
      ? bedStatuses.filter((b) => b.isOccupied === !available)
      : bedStatuses;

  // Remove encrypted patient names for roles without clinical access
  const hasClinicalAccess = ctx.roles.some((r) =>
    ["nurse", "doctor", "facility_head", "admin_staff"].includes(r)
  );

  const sanitizedBeds = filteredBeds.map((b) => ({
    bedId: b.bedId,
    bedLabel: b.bedLabel,
    wardId: b.wardId,
    wardName: b.wardName,
    isOccupied: b.isOccupied,
    admissionId: b.admissionId,
    // Only expose encrypted patient name to clinical staff
    patientNameEnc: hasClinicalAccess ? b.patientNameEnc : undefined,
  }));

  return NextResponse.json({
    data: sanitizedBeds,
    capacity: {
      totalBeds: capacity.totalBeds,
      occupiedBeds: capacity.occupiedBeds,
      availableBeds: capacity.availableBeds,
      waitlistCount: capacity.waitlistCount,
      occupancyPct: Math.round(capacity.occupancyPct * 1000) / 10, // 1 decimal place
    },
    meta: { facilityId, wardId: wardId ?? null },
  });
});
