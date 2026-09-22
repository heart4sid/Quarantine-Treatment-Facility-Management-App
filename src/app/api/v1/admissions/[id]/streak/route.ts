/**
 * GET /api/v1/admissions/[id]/streak — Get streak & discharge eligibility for an admission
 * TRD §8.2, V1-§4.3
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { getAdmissionStreak } from "@/server/services/temperatures";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const GET = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "admission:view");

  const { id: admissionId } = await params;
  if (!admissionId) {
    throw Errors.notFound("Admission", "missing");
  }

  const result = await getAdmissionStreak(admissionId, ctx.facilityId);

  return NextResponse.json(result, { status: 200 });
});
