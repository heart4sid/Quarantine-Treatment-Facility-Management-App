/**
 * GET /api/v1/auth/pin/staff
 * Returns staff list for the facility to populate tablet fast switch avatars.
 * TRD §7.1
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/server/api/handler";
import { requireAuthorization } from "@/server/authz/matrix";
import { getFacilityStaffForSwitch } from "@/server/services/pin";

export const GET = withAuth(async (req, ctx) => {
  requireAuthorization(ctx.roles, "auth:pin_manage");

  const staff = await getFacilityStaffForSwitch(ctx.facilityId);

  return NextResponse.json({
    staff,
  });
});
