/**
 * GET  /api/v1/waitlist    — Get the facility waitlist
 * PATCH /api/v1/waitlist/{id} — Update priority or cancel a waitlist entry
 * TRD §6.1, V1-§5.6
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { getWaitlist } from "@/server/services/admissions";
import { waitlistQuerySchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

// ─── GET /api/v1/waitlist ─────────────────────────────────────────────────────

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "waitlist:view");

  const { searchParams } = req.nextUrl;
  const queryParse = waitlistQuerySchema.safeParse({
    status: searchParams.get("status") ?? "WAITING",
    limit: searchParams.get("limit") ?? "50",
    offset: searchParams.get("offset") ?? "0",
  });

  if (!queryParse.success) {
    throw Errors.validationError(queryParse.error.issues);
  }

  const { status, limit, offset } = queryParse.data;
  const { facilityId } = ctx;

  const entries = await getWaitlist(facilityId, status, limit, offset);

  return NextResponse.json({
    data: entries.map((e) => ({
      id: e.id,
      priority: e.priority,
      status: e.status,
      // patientRef is encrypted — client decrypts with facility key
      patientRef: e.patientRef,
      createdAt: e.createdAt,
      admissionId: e.admissionId,
    })),
    meta: { status, limit, offset, facilityId },
  });
});
