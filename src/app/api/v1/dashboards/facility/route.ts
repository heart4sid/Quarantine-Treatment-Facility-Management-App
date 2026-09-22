/**
 * GET /api/v1/dashboards/facility
 * Facility Head & Quality Lead executive overview.
 * TRD §6.7, §8.2, V1-§4.5, V1-§4.6
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { getFacilityDashboard } from "@/server/services/dashboard";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "dashboard:facility");

  const data = await getFacilityDashboard(ctx.facilityId);

  return NextResponse.json(data);
});
