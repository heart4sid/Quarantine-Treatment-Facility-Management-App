/**
 * GET /api/v1/network/metrics
 * Cross-facility aggregate metrics for Regional Admin.
 * TRD §8.2, §11.2, V2-§4.3, V2-§5.7
 *
 * Invariant: Regional Admin has NO patient-level clinical data access.
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { getNetworkMetrics } from "@/server/services/network";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "dashboard:network");

  const { searchParams } = new URL(req.url);
  const networkId = searchParams.get("networkId") || undefined;

  const data = await getNetworkMetrics(networkId);

  return NextResponse.json(data);
});
