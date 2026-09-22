/**
 * POST /api/v1/med-slots/[id]/administration
 * Nurse logs medication administration (ADMINISTERED / MISSED / REFUSED).
 * TRD §8.2, §11.1, V2-§4.2
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { administerMedSchema } from "@/server/api/schemas";
import { administerMedication } from "@/server/services/medication";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  requireAuthorization(ctx.roles, "med:administer");
  const { id: slotId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = administerMedSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validationError(parsed.error.issues);
  }

  const result = await administerMedication(slotId, parsed.data, ctx);

  return NextResponse.json(result, { status: 201 });
});
