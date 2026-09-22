/**
 * POST /api/v1/admissions/[id]/outcome — Doctor records DECEASED or TRANSFERRED outcome
 * TRD §6.7, §8.2, V1-§4.5, DECISIONS.md G5
 *
 * Doctor role only.
 * DISCHARGED_CURED is set automatically by admin execution; doctors record non-cure outcomes.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { recordOutcome } from "@/server/services/discharge";
import { recordOutcomeSchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
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

  const parse = recordOutcomeSchema.safeParse(body);
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  // Doctor role check based on outcome type (DECISIONS.md G5)
  if (parse.data.outcome === "DECEASED") {
    requireAuthorization(ctx.roles, "outcome:record_deceased");
  } else {
    requireAuthorization(ctx.roles, "outcome:record_transferred");
  }

  const result = await recordOutcome(admissionId, parse.data, ctx);

  return NextResponse.json(result, { status: 200 });
});
