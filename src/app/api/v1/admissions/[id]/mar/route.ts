/**
 * GET /api/v1/admissions/[id]/mar
 * Returns patient Medication Administration Record (MAR).
 * TRD §11.1, V2-§4.2
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { getPatientMar } from "@/server/services/medication";

export const GET = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "admission:view");
  const { id: admissionId } = await params;

  const mar = await getPatientMar(admissionId, ctx.facilityId);

  return NextResponse.json(mar);
});
