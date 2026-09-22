/**
 * GET /api/v1/exports/outcomes
 * Streamed CSV export of admissions and outcomes with audit trail.
 * TRD §8.2, §11.4, V2-§4.5
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { exportOutcomesCsv } from "@/server/services/analytics";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "analytics:view");

  const csv = await exportOutcomesCsv(ctx.facilityId, ctx.userId, ctx.roles);

  const filename = `outcomes-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
});
