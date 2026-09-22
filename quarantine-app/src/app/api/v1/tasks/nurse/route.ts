/**
 * GET /api/v1/tasks/nurse?date= — Daily task list for nurses
 * TRD §8.2, V1-§4.2
 *
 * Returns assigned/open admissions with measured/not measured status,
 * latest temperature reading today, current streak, and eligibility.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { getNurseTasks } from "@/server/services/temperatures";
import { nurseTaskQuerySchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "admission:view");

  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get("date") ?? undefined;

  const parse = nurseTaskQuerySchema.safeParse({ date: dateParam });
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await getNurseTasks(ctx.facilityId, ctx.userId, parse.data.date);

  return NextResponse.json(result, { status: 200 });
});
