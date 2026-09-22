/**
 * GET /api/v1/tasks/doctor?date= — Priority-sorted doctor daily task list
 * TRD §8.2, V1-§4.3
 *
 * Sort priority:
 *   1. Discharge-Eligible patients needing approval
 *   2. Patients with active fever today
 *   3. Patients needing today's visit (vitals ready)
 *   4. Patients waiting for vitals
 *   5. Patients already visited today
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { getDoctorTasks } from "@/server/services/visits";
import { doctorTaskQuerySchema } from "@/server/api/schemas";
import { requireAuthorization } from "@/server/authz/matrix";
import { Errors } from "@/lib/errors";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "admission:view");

  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get("date") ?? undefined;

  const parse = doctorTaskQuerySchema.safeParse({ date: dateParam });
  if (!parse.success) {
    throw Errors.validationError(parse.error.issues);
  }

  const result = await getDoctorTasks(ctx.facilityId, ctx.userId, parse.data.date);

  return NextResponse.json(result, { status: 200 });
});
