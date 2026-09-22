/**
 * POST /api/v1/admissions/[id]/discharge — Admin executes cured discharge
 * TRD §6.3, §8.2, V1-§4.4, DECISIONS.md G3
 *
 * Admin role only.
 * Invariant: Re-validates eligibility in the SAME transaction.
 * If streak broke between approval and execution, voids approval and returns 409 ELIGIBILITY_CHANGED.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { executeDischarge } from "@/server/services/discharge";
import { executeDischargeSchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "discharge:execute");

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

  const parse = executeDischargeSchema.safeParse(body);
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await executeDischarge(admissionId, parse.data, ctx);

  return NextResponse.json(result, { status: 200 });
});
