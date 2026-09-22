/**
 * POST /api/v1/temperatures/[id]/amendments — Amend or void a temperature reading
 * TRD §6.8, §7.2, §8.2, V1-§5.9, DECISIONS.md G10
 *
 * Appends an amendment row (never updates/deletes).
 * Nurse: own reading only, same calendar day only, cannot void.
 * Doctor: any reading, any day, can void (valueC = null).
 * Requires reason code (+ reasonNote if OTHER).
 * Edge-triggers streak and discharge eligibility re-evaluation.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { amendTemperature } from "@/server/services/temperatures";
import { amendTemperatureSchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  // Nurse or Doctor (matrix checks baseline; service checks fine-grained G10 rules)
  requireAuthorization(ctx.roles, "temp:amend:own_same_day");

  const { id: readingId } = await params;
  if (!readingId) {
    throw Errors.notFound("TemperatureReading", "missing");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.validationError([{ message: "Invalid JSON body" }]);
  }

  const parse = amendTemperatureSchema.safeParse(body);
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await amendTemperature(readingId, parse.data, ctx);

  return NextResponse.json(result, { status: 201 });
});
