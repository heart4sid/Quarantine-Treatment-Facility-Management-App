/**
 * POST /api/v1/admissions/[id]/temperatures — Log a daily temperature reading
 * TRD §8.2, V1-§4.2, V1-§5.1, V1-§5.3
 *
 * Nurse role only.
 * Appends reading to temperature_readings (immutable).
 * If a reading already exists for today's local_date, returns 409 DUPLICATE_TODAY
 * unless confirmedDuplicate: true.
 * Edge-triggers fever-free streak and discharge eligibility re-evaluation.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { logTemperature } from "@/server/services/temperatures";
import { logTemperatureSchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "temp:log");

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

  const parse = logTemperatureSchema.safeParse(body);
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await logTemperature(admissionId, parse.data, ctx);

  return NextResponse.json(result, { status: 201 });
});
