/**
 * GET /api/v1/analytics/trends
 * Executive throughput and admission cohorts by ISO week.
 * TRD §8.2, §11.4, V2-§4.5
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { getFacilityTrends } from "@/server/services/analytics";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "analytics:view");

  const { searchParams } = new URL(req.url);
  const days = Math.min(90, Math.max(7, Number(searchParams.get("days") || 30)));

  const data = await getFacilityTrends(ctx.facilityId, days);

  return NextResponse.json(data);
});
