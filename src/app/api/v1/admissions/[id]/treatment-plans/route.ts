/**
 * POST /api/v1/admissions/[id]/treatment-plans
 * Doctor prescribes a treatment plan with medication orders.
 * TRD §8.2, §11.1, V2-§4.2
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { createTreatmentPlanSchema } from "@/server/api/schemas";
import { createTreatmentPlan } from "@/server/services/medication";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "treatment:create");
  const { id: admissionId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = createTreatmentPlanSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validationError(parsed.error.issues);
  }

  const result = await createTreatmentPlan(admissionId, parsed.data, ctx);

  return NextResponse.json(result, { status: 201 });
});
