/**
 * GET /api/v1/discharge-queue — List approved discharges awaiting admin execution
 * TRD §6.3, §8.2, V1-§4.4
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { getDischargeQueue } from "@/server/services/discharge";
import { requireAuthorization } from "@/server/authz/matrix";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "admission:view");

  const queue = await getDischargeQueue(ctx.facilityId);

  return NextResponse.json({ data: queue }, { status: 200 });
});
