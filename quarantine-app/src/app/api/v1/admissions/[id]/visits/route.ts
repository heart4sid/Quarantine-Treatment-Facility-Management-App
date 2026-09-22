/**
 * POST /api/v1/admissions/[id]/visits — Record a doctor clinical visit
 * TRD §6.5, §8.2, V1-§4.3, V1-§5.2
 *
 * Doctor role only.
 * 428 TEMP_MISSING_TODAY exception flow:
 *   - If no temperature reading exists for today, returns 428 Precondition Required
 *     unless noTempException: true with exceptionReason (min 10 chars).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { recordVisit } from "@/server/services/visits";
import { startVisitSchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "visit:start");

  const { id: admissionId } = await params;
  if (!admissionId) {
    throw Errors.notFound("Admission", "missing");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.validationError([{ message: "Invalid JSON body" }]);
  }

  const parse = startVisitSchema.safeParse(body);
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await recordVisit(admissionId, parse.data, ctx);

  return NextResponse.json(result, { status: 201 });
});
