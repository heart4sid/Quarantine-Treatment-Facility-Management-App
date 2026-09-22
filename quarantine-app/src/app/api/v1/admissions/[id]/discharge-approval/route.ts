/**
 * POST /api/v1/admissions/[id]/discharge-approval — Doctor approves discharge
 * TRD §6.3, §8.2, V1-§4.4, V1-§5.5
 *
 * Doctor role only.
 * Re-validates current fever-free streak before writing approval.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { approveDischarge } from "@/server/services/discharge";
import { dischargeApprovalSchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "discharge:approve");

  const { id: admissionId } = await params;
  if (!admissionId) {
    throw Errors.notFound("Admission", "missing");
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    throw Errors.validationError([{ message: "Invalid JSON body" }]);
  }

  const parse = dischargeApprovalSchema.safeParse(body);
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await approveDischarge(admissionId, parse.data, ctx);

  return NextResponse.json(result, { status: 201 });
});
